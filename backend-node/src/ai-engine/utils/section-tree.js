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
/** chart 叶子判定（⑤ 豁免用；只认小写 type） */
function isChartLeaf(sec) {
  return String(sec?.type || '').toLowerCase() === 'chart'
}

/**
 * 「图表签名」——用于判定两条 chart section 是否为**不同图表**（⑤ 豁免）：
 * chartType + series 条数 + 标题。签名不同 → 不同图表（都保留）；完全相同 → 视为真重复。
 */
function chartSignature(sec) {
  const series = Array.isArray(sec?.chartSeries) ? sec.chartSeries.length : 0
  return `${String(sec?.chartType || '')}|${series}|${String(sec?.title || '')}`
}

export function dedupeDuplicateSections(sections) {  if (!Array.isArray(sections)) return sections
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
      // 🛡️ ⑤（2026-09-26 · 离线复现实锤）：**两个 chart section 共享 sourceNodeIds 时不得按
      //   elementCount 收敛**。vision 会把「同一 Figma 容器下的多个不同图表」标成同一个 section
      //   （E1 注释已记录该形态），`injectChartSectionIfMissing` 的 chartsTruth 分支因此产出
      //   N 条 `sourceNodeIds: [c.section]` 相同的 chart section，且 elementCount 全为 1（平局）
      //   → 现行为**确定性只保留 1 条、丢掉 N-1 个图表**（探针实测：bar/pie/line 三条 → 只剩 bar）。
      //   判据：两条都是 chart 且**图表签名不同**（chartType + series 条数 + 标题）→ 是不同图表，
      //   两条都保留；签名完全相同才视为真重复（照旧按 elementCount 收敛）。
      //   作用域刻意收窄：**只改 chart↔chart**，chart↔非 chart（如 d55641d0 的 89:42 vs 89:38）
      //   维持原行为，避免扩大误伤面。
      if (isChartLeaf(prev) && isChartLeaf(sec) && chartSignature(prev) !== chartSignature(sec)) {
        if (Array.isArray(sec.children)) {
          out.push({ ...sec, children: dedupeDuplicateSections(sec.children) })
        } else {
          out.push(sec)
        }
        continue
      }
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
 * 🛡️ E1 治本（2026-09-16 · c-traffic-monitor-bc0c25aa 实锤）：section id 唯一化。
 *
 * 动机：vision 对「同一 Figma 容器下的多个不同图表」会输出**相同的 section id**
 * （如 3 个图表 section 的 id 全是 `426:807`，sourceNodeIds 却是 2:7459/2:7628/2:3604
 * 三个不同节点）。dedupeDuplicateSections 按 sourceNodeIds 去重**正确地保留了这 3 个真图表**，
 * 但重复的 id 进入 prompt（`426:807 — 江阴靖江长江隧道` / `426:807 — 江阴大桥` / `426:807 — 流量预测`）
 * → LLM 把 3 个同 id section 混淆成「同一 section 重复 3 次」→ 生成 ChartForecast×3 空壳 +
 * ChartChart/ChartChart2 命名碰撞。
 *
 * 规则：递归整棵树，统计 id 出现次数；重复 id 保留第一个原样，后续按出现序加 `-2`/`-3` 后缀。
 * 幂等；id 仅用于 prompt 呈现与诊断，下游对齐全部走 sourceNodeIds，加后缀不破坏关联。
 *
 * @param {Array} sections effectiveSections 树
 * @returns {Array} id 唯一化后的树（无重复时返回原引用）
 */
export function uniqueSectionIds(sections) {
  if (!Array.isArray(sections)) return sections
  const count = new Map()
  const collect = (arr) => {
    for (const sec of arr) {
      if (!sec || typeof sec !== 'object') continue
      const id = String(sec.id || '')
      if (id) count.set(id, (count.get(id) || 0) + 1)
      if (Array.isArray(sec.children)) collect(sec.children)
    }
  }
  collect(sections)
  if (![...count.values()].some((c) => c > 1)) return sections

  const seen = new Map()
  const walk = (arr) =>
    arr.map((sec) => {
      if (!sec || typeof sec !== 'object') return sec
      const id = String(sec.id || '')
      let next = sec
      if (id && (count.get(id) || 0) > 1) {
        const n = seen.get(id) || 0
        seen.set(id, n + 1)
        if (n > 0) next = { ...sec, id: `${id}-${n + 1}` }
      }
      if (Array.isArray(sec.children)) {
        next = { ...next, children: walk(sec.children) }
      }
      return next
    })
  return walk(sections)
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
/** 取节点盒（兼容 `bbox` 与 `absoluteBoundingBox` 两种形态）。 */
function nodeBox(n) {
  return n?.bbox || n?.absoluteBoundingBox || null;
}

/**
 * 🛡️ B′（2026-09-28 · 命名无关）：判定「横向并列的同构卡片单元」——命中时子项应**等分**，
 * 而不是按各自宽度比例分配（实测 mc-max-1790583597309-cf26267d：两个"标题+数值"单元被
 * 按文字组宽度 128/77 拉伸成 0.376/0.624，视觉完全失真）。
 *
 * 判据（全语料审计定稿：宽松版 289 命中里 0 个真卡片、全是图表刻度/图例 ⇒ 必须加固）：
 *   A 排除与父容器 bbox 一致的子节点（背景层，不参与成员计算）
 *   ① 容器不在 `@echarts` 子树内  ② 成员子树**只含 TEXT**（1~3 条）且宽 ≥ 40px
 *   ③ 成员内部文本**上下堆叠**（y 不同）← 「卡片」与「刻度/图例」的分水岭（实测一票否决有效）
 *   ④ 成员数 2~3  ⑤ 成员宽和 < 70% 容器宽  ⑥ 成员 y 区间重叠（同一行）
 * 任一数据缺失 ⇒ false（fail-open，保持既有行为）。
 * 审计：45 个真实任务命中 6 次，全部为同一目标行（2:3660），**零误伤**。
 *
 * @param {object} parentNode 容器 Figma 节点
 * @param {Array<object>} memberNodes 成员 Figma 节点（已按计划序）
 * @returns {boolean}
 */
export function isHorizontalCardGroup(parentNode, memberNodes) {
  try {
    const pb = nodeBox(parentNode);
    const list = (memberNodes || []).filter((m) => m && nodeBox(m));
    if (!pb || !pb.width || !pb.height || list.length < 2) return false;
    // A：排除与父同尺寸的子节点（背景层）
    const EARLY = 0.02;
    const keep = list.filter((m) => {
      const b = nodeBox(m);
      if (!b.width || !b.height) return false;
      return !(
        Math.abs(b.width - pb.width) <= EARLY * pb.width + 1 &&
        Math.abs(b.height - pb.height) <= EARLY * pb.height + 1
      );
    });
    // ④ 成员数 2~3
    if (keep.length < 2 || keep.length > 3) return false;
    // ⑥ 同一行（与父 y 区间重叠）
    const sameRow = keep.filter((m) => {
      const b = nodeBox(m);
      return b.y < pb.y + pb.height && b.y + b.height > pb.y;
    });
    if (sameRow.length !== keep.length) return false;
    // ⑤ 成员宽和 < 70% 容器宽
    const sumW = sameRow.reduce((s, m) => s + (nodeBox(m).width || 0), 0);
    if (!(sumW < 0.7 * pb.width)) return false;
    // ② 成员子树只含 TEXT（无图形，含 `visible:false` 也视为图形类载体不计）
    const memberOk = (m) => {
      const stack = [...(m.children || [])];
      const ys = new Set();
      let textCount = 0;
      while (stack.length) {
        const c = stack.pop();
        if (!c || typeof c !== 'object') continue;
        if (c.type === 'TEXT') {
          textCount += 1;
          const b = nodeBox(c);
          if (b && typeof b.y === 'number') ys.add(Math.round(b.y));
          continue;
        }
        return false; // 出现非 TEXT 后代 ⇒ 非"纯文本卡片单元"
      }
      // ③ 内部上下堆叠 + 文本条数 1~3
      return textCount >= 1 && textCount <= 3 && ys.size > 1;
    };
    if (!sameRow.every(memberOk)) return false;
    // ② 成员宽 ≥ 40px
    if (!sameRow.every((m) => (nodeBox(m).width || 0) >= 40)) return false;
    return true;
  } catch {
    return false;
  }
}

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
  // 🛡️ 栅格信息增强（2026-09-21 · mc-max-1789984497669 实锤）：当 type=grid 但没有
  //   gridColumns 时，从 children 推断列数，并标注"共 N 个子项"，让 LLM 能理解
  //   grid section 的结构，避免生成空组件或错误布局。
  let gridCols = sec.gridColumns ?? (sec.body && sec.body.gridColumns)
  const childCount = Array.isArray(sec.children) ? sec.children.length : 0
  let gridNote = ''
  if (gridCols && Number(gridCols) > 1) {
    gridNote = `，栅格 ${gridCols} 列 (display: grid; grid-template-columns: repeat(${gridCols}, 1fr))`
  } else if (sec.type === 'grid' && childCount > 0) {
    // 从 children 推断列数：取第一个有 children 的子项的子项数作为列数
    let inferredCols = 0
    for (const child of sec.children) {
      if (Array.isArray(child.children) && child.children.length > 0) {
        inferredCols = child.children.length
        break
      }
    }
    if (inferredCols > 0) {
      gridNote = `，栅格 ${inferredCols} 列 (display: grid; grid-template-columns: repeat(${inferredCols}, 1fr))`
    }
  }
  const extra = sec.elementCount ? `，含 ${sec.elementCount} 个元素` : ''
  const childInfo = sec.type === 'grid' && childCount > 0 ? `，共 ${childCount} 个子项` : ''
  const score =
    sec.complexityScore !== undefined ? `，复杂度 ${sec.complexityScore}` : ''
  
  // 🛡️ tabs section 区分度增强（2026-09-21 · c-env-monitor 实锤）：
  //   多个 tabs section 时 LLM 易合并成单个组件。治本：提取 body.items 文本真值，
  //   展示每个 tabs 的具体内容（如"一氧化碳/能见度/洞内照明"），让 LLM 能区分。
  let tabsNote = ''
  if (sec.type === 'tabs') {
    const items = sec.body?.items || []
    if (Array.isArray(items) && items.length > 0) {
      const itemTexts = items
        .map((item) => (typeof item === 'string' ? item : item?.text))
        .filter(Boolean)
        .slice(0, 5) // 最多展示 5 个，避免 prompt 过长
      if (itemTexts.length > 0) {
        tabsNote = `，标签项 [${itemTexts.join('、')}]`
      }
    }
  }

  // 🛡️ H DOM contract（2026-09-22 · mc-1790048059931 实锤）：collapsed 卡 item 级骨架约束。
  //   planner 已从 Figma 几何确定性推导出卡内骨架（文本纵/横排 + icon 实测尺寸），
  //   此处打印硬约束给 LLM——卡内结构必须按此生成，禁止自由发挥（尤其是文本列方向）。
  //   注：判定用 itemSkeleton 存在性而非 sec.collapsed——E1 路径下 cons 网格（12 卡）被
  //   当作 R2 豁免 leaf（未标 collapsed），planner 仍会注入 itemSkeleton（deriveItemSkeleton
  //   用「≥4 子卡 + textStack」兜底），此处必须同步打印。
  let itemSkeletonNote = ''
  if (sec.itemSkeleton) {
    const sk = sec.itemSkeleton
    const dirText = sk.textDirection === 'column' ? '纵向堆叠（label 上 value 下，flex-direction: column）' : '横向并排（flex-direction: row）'
    const iconText = sk.icon ? `，icon 固定 ${sk.icon.widthPx}×${sk.icon.heightPx}px` : ''
    const texts = Array.isArray(sk.texts) && sk.texts.length > 0 ? `，文本项 [${sk.texts.slice(0, 4).join(' / ')}]` : ''
    itemSkeletonNote = `，⚠️卡内骨架（H 契约，禁止改写）：文本列${dirText}${iconText}${texts}`
  }

  return `${pad}- \`${sec.id}\` — ${sec.responsibility || sec.type || '区块'}${title}${layout}${gridNote}${extra}${childInfo}${tabsNote}${itemSkeletonNote}${score}`
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
      // 🛡️ 布局方向事实（2026-09-16 治本）：容器 layout 由 Figma 几何确定性推导，
      //   switch=horizontal（两个 tab 一行）、tabs=vertical（竖排）。此前硬编码「纵向」，
      //   导致 LLM 把 switch 渲染成上下堆叠（用户指正「两个 tab 应该在一行」）。
      const layoutDir = String(sec.layout || 'vertical').toLowerCase()
      const isHorizontal = layoutDir === 'horizontal'
      const dirText = isHorizontal ? '横向（flex-direction: row）' : '纵向（flex-direction: column）'
      lines.push(
        `${pad}- 容器 \`${sec.id}\`（${title}）：${dirText} flex 包裹，不单独生成 .vue。子区块顺序 [${childIds}]。父模板必须按 ${isHorizontal ? 'row' : 'column'} 包住下列子组件，禁止打平。`,
      )
      if (Array.isArray(sec.children)) {
        lines.push(formatSectionTreeForPrompt(sec.children, indent + 1))
      }
    } else {
      lines.push(formatOne(sec, indent))
      // 🛡️ H3 硬骨架 DOM 模板（2026-09-22）：有 itemSkeleton 的 section，给 LLM 完整卡内
      //   DOM 结构模板照抄（icon + 文本列），LLM 只填变量绑定，禁止改结构/类名/方向。
      if (sec.itemSkeleton) {
        lines.push(formatItemSkeletonTemplate(sec, indent + 1))
      }
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
 * 🛡️ H3 卡内硬骨架模板（2026-09-22 · mc-1790058609462 实锤）：把 itemSkeleton 事实渲染成
 *   「照抄即用」的卡内 DOM 模板。治「LLM 自由发挥卡内结构」（类名漂移 cons-bg/cons-info、
 *   文本列写成 row）。LLM 只需替换 `<你的数组名>` / `<字段名>`，禁止改结构/类名/方向。
 */
function formatItemSkeletonTemplate(sec, indent) {
  const sk = sec.itemSkeleton
  if (!sk) return ''
  const pad = '  '.repeat(indent)
  const lines = []
  const icon = sk.icon
  const dir = sk.textDirection === 'column' ? 'column' : 'row'
  const gap = sk.gapPx || 4

  lines.push(`${pad}▼ 卡内骨架模板（H 契约·照抄结构，只替换变量绑定，禁止改结构/类名/方向）：`)
  lines.push(`${pad}\`\`\``)
  lines.push(`${pad}<template>`)
  lines.push(`${pad}  <div v-for="item in <你的数组名>" :key="item.<id字段>" class="<卡容器类>">`)

  // icon（左/右由 Figma 几何推断）
  if (icon) {
    if (sk.iconPosition === 'left') {
      lines.push(`${pad}    <div class="<卡容器类>-icon">`)
      lines.push(`${pad}      <img :src="item.icon" alt="" style="width: ${icon.widthPx}px; height: ${icon.heightPx}px;" />`)
      lines.push(`${pad}    </div>`)
    }
    lines.push(`${pad}    <div class="<卡容器类>-text" style="display: flex; flex-direction: ${dir}; gap: ${gap}px;">`)
  } else {
    lines.push(`${pad}    <div class="<卡容器类>-text" style="display: flex; flex-direction: ${dir}; gap: ${gap}px;">`)
  }
  // 文本项：按 Figma 真值顺序（label/value/value2/…）
  const fields = (sk.texts || []).map((t, i) => {
    if (i === 0) return 'label'
    if (i === 1) return 'value'
    return `value${i}`
  })
  sk.texts?.forEach((txt, i) => {
    lines.push(`${pad}      <span>{{ item.${fields[i]} }}</span>`)
  })
  lines.push(`${pad}    </div>`)
  if (icon && sk.iconPosition === 'right') {
    lines.push(`${pad}    <div class="<卡容器类>-icon">`)
    lines.push(`${pad}      <img :src="item.icon" alt="" style="width: ${icon.widthPx}px; height: ${icon.heightPx}px;" />`)
    lines.push(`${pad}    </div>`)
  }
  lines.push(`${pad}  </div>`)
  lines.push(`${pad}</template>`)
  lines.push(`${pad}\`\`\``)
  lines.push(`${pad}（文本内容真值：${(sk.texts || []).join(' / ')}；icon ${icon ? `${icon.widthPx}×${icon.heightPx}px${sk.iconPosition ? ` 在${sk.iconPosition === 'left' ? '左' : '右'}` : ''}` : '无'}）`)
  return lines.join('\n')
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
      // 🛡️ 列位置优先（2026-09-20 · R2 列检测元数据）
      // 当 sec 含 columnPosition 时，直接用"Left/Right/Middle"作为后缀
      let suffix = '';
      if (sec.columnPosition) {
        const colMap = { '左': 'Left', '右': 'Right', '中': 'Middle' };
        suffix = colMap[sec.columnPosition] || `${sec.columnPosition}Col`;
      } else {
        suffix = semanticSuffixFor(sec, base);
        // 退化形态（无语义 token）：用 id 派生稳定短后缀
        if (!suffix) suffix = stableIdSuffix(sec);
      }
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

/**
 * 🛡️ E1 治本（2026-09-16）：从 Figma 节点树确定性推导 section 结构（递归版本）。
 *
 * 动机：vision（LLM）自由发挥划分 sections 是「布局崩塌」的根源——重复 sub-header、
 * 命名混乱（ChartChart2/3）、高度缺失（vision 不输出 absoluteBoundingBox → flexGrow 拿不到）。
 * 而 Figma 节点树（figma-node-data.json）有 100% 确定性事实：根 FRAME 的直接子节点就是
 * section（FRAME/GROUP），背景/装饰是 VECTOR/BOOLEAN/RECTANGLE，高度 = absoluteBoundingBox。
 *
 * 🆕 递归推导（2026-09-16 治本）：不仅处理根节点的直接子节点，还递归推导嵌套 section。
 *   - 对每个 section 的 children，识别 FRAME/GROUP 节点并提升为嵌套 section
 *   - 所有层级的 section 都注入确定性高度（absoluteBoundingBox）
 *   - 保留 @echarts 图表语义识别
 *   - 保留背景节点过滤
 *
 * 输出「vision section 格式」（含 absoluteBoundingBox），planner 的 buildEffectiveSection
 * 可零改动消费；sourceNodeIds 天然确定（= 节点 id），无需 vision 猜、无需 dedupe/anchor/strip。
 *
 * @param {Object} figmaNodeData figma-node-data.json 内容（{ document } 或直接是节点树）
 * @returns {{sections:Array, backgrounds:Array, rootName:string, rootId:string}|null}
 */
/**
 * 🛡️ 通用判定：一个 header Figma 节点是否为「纯 chrome」（base-panel 外壳标题栏）。
 *
 * 背景（2026-09-17 · 环境监测 mc-max-1789609034769-85b79dc7 实锤）：
 *   deriveSectionsFromFigmaTree 此前对任何名为 `header` 的节点一律标 `type:header`，
 *   而视觉分析路径的 chrome 剥离（stripChromeSectionsInPlace）只作用于 vision 的 sections、
 *   不作用于确定性推导的 Figma 树 → 纯装饰标题栏（VECTOR×N + circle/path + 单个标题文本）
 *   被当成业务 header 进 planner → engineer 臆造 divider/circles/gradient-bar 进 default slot。
 *
 * 而业务 header（重点车辆监测：header 内含 tabs FRAME + 双文本小标题）必须保留。
 * 判定纯 chrome 的通用规则（**零硬编码、与命名无关**，只依赖 Figma 节点类型）：
 *   - 子树中出现业务容器（FRAME / INSTANCE / COMPONENT / COMPONENT_SET）→ 有业务内容；
 *   - 子树 TEXT 节点数 > 1（标题 + 副标题/说明）→ 有业务内容；
 *   - 子树 GROUP 名含交互/业务语义（tab/stat/button/switch/icon/指标/切换/统计/导航…）→ 有业务内容；
 *   - 否则（仅 VECTOR/RECTANGLE/ELLIPSE/LINE… 装饰形状 + 至多 1 个标题 TEXT）→ 纯 chrome。
 *
 * 装饰形状（VECTOR/RECTANGLE/ELLIPSE/LINE/STAR/POLYGON/BOOLEAN_OPERATION/SLICE）默认忽略。
 *
 * @param {Object} node Figma 节点（type/name/children）
 * @returns {boolean} true = 纯 chrome 标题栏（可剥离）
 */
export function headerIsChromeOnly(node) {
  if (!node || typeof node !== 'object') return false
  // 🛡️ 保守原则（宁可漏删、不可误删）：header 节点无任何 children 时，无法判定
  //   其是否为纯装饰标题栏（可能是 Figma 导出裁剪 / 测试简化数据），一律保留。
  const kids = node.children
  if (!Array.isArray(kids) || kids.length === 0) return false
  let textCount = 0
  let business = false
  const BUSINESS_CONTAINER_TYPES = new Set([
    'FRAME',
    'INSTANCE',
    'COMPONENT',
    'COMPONENT_SET',
  ])
  const BUSINESS_NAME_RE = /tab|stat|button|switch|select|input|list|grid|card|icon|指标|切换|统计|按钮|导航|菜单|下拉|搜索|筛?选/i
  const walk = (n) => {
    if (!n || typeof n !== 'object' || business) return
    const t = String(n.type || '').toUpperCase()
    const name = String(n.name || '')
    // 业务容器类型 → 有业务内容，立即终止
    if (BUSINESS_CONTAINER_TYPES.has(t)) {
      business = true
      return
    }
    if (t === 'TEXT') {
      textCount += 1
      if (textCount > 1) {
        business = true
        return
      }
      return
    }
    // 交互/业务语义命名（GROUP 等包裹层下）→ 有业务内容
    if (BUSINESS_NAME_RE.test(name)) {
      business = true
      return
    }
    for (const c of n.children || []) walk(c)
  }
  walk(node)
  return !business
}

/**
 * 🛡️ 通用 x 轴聚类（2026-09-17 · 策略类型分布 mc-max-1789609027227-ca6d41b5 实锤）
 *
 * 背景：环形图两侧「图例分列」布局（legendPosition=left-right-split），Figma 真值树里
 *   `统计数据` 容器横跨全宽，内部 8 个 item 按 x 坐标天然聚成左右两列（左列 x=303、
 *   右列 x=806），环形图恰好落在两列之间的空档。E1 推导此前把该容器当单个 stats 叶
 *   （8 项平铺），丢失「按 x 分列」的几何结构 → engineer 生成 2 列 grid 错乱排布。
 *
 * 治本：按 Figma absoluteBoundingBox.x 做确定性聚类（零硬编码、不依赖命名/vision 语义），
 *   识别「多个 item 按 x 明显分成 N 列、每列内部按 y 递增」的多列布局。
 *
 * 保守原则（宁可漏识、不可误拆）：
 *   - item 总数 < 4 不识别（不足以构成多列）；
 *   - 聚类后列数 < 2 不识别；
 *   - 任一列 item 数 < 2 不识别（单列散点/不均匀分布不拆）。
 *
 * @param {Array} items 子节点列表（含 absoluteBoundingBox.x/y）
 * @param {number} [xTolerance=10] x 坐标归并容差（px）
 * @returns {Array|null} 列数组 [{ columnX, items }]（items 已按 y 升序），非多列返回 null
 */
export function clusterItemsByColumnX(items, xTolerance = 10) {
  const valid = (items || []).filter(
    (it) =>
      it &&
      typeof it === 'object' &&
      it.absoluteBoundingBox &&
      typeof it.absoluteBoundingBox.x === 'number',
  )
  if (valid.length < 4) return null

  const tol = Number.isFinite(xTolerance) && xTolerance > 0 ? xTolerance : 10
  const buckets = new Map()
  for (const it of valid) {
    const x = it.absoluteBoundingBox.x
    let key = null
    for (const bx of buckets.keys()) {
      if (Math.abs(bx - x) <= tol) {
        key = bx
        break
      }
    }
    if (key == null) {
      key = Math.round(x)
      buckets.set(key, [])
    }
    buckets.get(key).push(it)
  }

  const cols = [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([columnX, list]) => ({
      columnX,
      items: list.sort(
        (a, b) =>
          ((a.absoluteBoundingBox?.y ?? 0) - (b.absoluteBoundingBox?.y ?? 0)) ||
          ((a.absoluteBoundingBox?.x ?? 0) - (b.absoluteBoundingBox?.x ?? 0)),
      ),
    }))

  if (cols.length < 2) return null
  if (cols.some((c) => c.items.length < 2)) return null
  return cols
}

/**
 * 🛡️ 通用「图表居中 + 图例分两侧」布局重组（2026-09-17 · 策略类型分布实锤）
 *
 * 识别容器内 [chart, stats] 两栏中的「图例分列、图表居中」几何关系：
 *   - stats 内部 item 按 x 聚类成恰好 2 列（左右各 ≥2 项）；
 *   - chart 的 bbox 落在 stats 左右两列之间的空档（chart 居中）。
 * 满足 → 把 stats 拆成 left-stats + right-stats 两个子列，重组为
 *   [left-stats, chart, right-stats] 并按 x 排序，还原「左图例 | 环形图 | 右图例」。
 *
 * 纯几何、零硬编码：只依赖 absoluteBoundingBox，不依赖命名/vision 语义。
 * 不满足条件时原样返回（零误伤）。
 *
 * @param {Array} sections 同层子 section 列表
 * @returns {Array} 重组后的 section 列表（或原样）
 */
export function reorganizeCenteredChartLayout(sections) {
  if (!Array.isArray(sections) || sections.length < 2) return sections

  const chartIdx = sections.findIndex((s) => s?.type === 'chart')
  const statsIdx = sections.findIndex(
    (s) =>
      s?.type === 'stats' &&
      Array.isArray(s?.children) &&
      s.children.length >= 4,
  )
  if (chartIdx < 0 || statsIdx < 0 || chartIdx === statsIdx) return sections

  const chart = sections[chartIdx]
  const stats = sections[statsIdx]
  const cols = clusterItemsByColumnX(stats.children)
  if (!cols || cols.length !== 2) return sections

  const [leftCol, rightCol] = cols
  const cb = chart.absoluteBoundingBox
  if (!cb || typeof cb.x !== 'number') return sections

  const leftWidths = leftCol.items
    .map((i) => i.absoluteBoundingBox?.width)
    .filter((w) => Number.isFinite(w))
  const leftRightEdge = leftCol.columnX + (leftWidths.length ? Math.max(...leftWidths) : 0)
  const rightLeftEdge = rightCol.columnX
  const chartCentered =
    cb.x >= leftRightEdge && cb.x + (cb.width || 0) <= rightLeftEdge
  if (!chartCentered) return sections

  const makeColumnSection = (col, suffix) => {
    const xs = col.items
      .map((i) => i.absoluteBoundingBox?.x)
      .filter((v) => Number.isFinite(v))
    const ys = col.items
      .map((i) => i.absoluteBoundingBox?.y)
      .filter((v) => Number.isFinite(v))
    const widths = col.items
      .map((i) => i.absoluteBoundingBox?.width)
      .filter((v) => Number.isFinite(v))
    const heights = col.items
      .map((i) => i.absoluteBoundingBox?.height)
      .filter((v) => Number.isFinite(v))
    return {
      ...stats,
      id: `${stats.id}-${suffix}`,
      name: `${stats.name || 'stats'}-${suffix}`,
      title: `${stats.title || stats.name || 'stats'}-${suffix}`,
      // 🛡️ figmaNodeId 必须唯一化（2026-09-17 实锤）：若沿用原 stats 的 figmaNodeId
      //   （如 287:5），planner enrich 阶段用 vision 语义按 figmaNodeId 回填时，left/right
      //   两个 section 会同时匹配到同一 vision section → id 双双被覆盖成 287:5（重复）→
      //   uniqueSectionIds 再改成 287:5-2 → 左右列语义丢失、chart 未居中。
      //   此处用子列首项 figmaNode（各列不同）作 figmaNodeId，使 enrich 无法误匹配。
      figmaNodeId: String(col.items[0]?.figmaNode || col.items[0]?.id || `${stats.id}-${suffix}`),
      children: col.items,
      layout: 'vertical',
      gridColumns: undefined,
      ...(xs.length && ys.length
        ? {
            absoluteBoundingBox: {
              x: Math.min(...xs),
              y: Math.min(...ys),
              width: widths.length ? Math.max(...widths) : 0,
              height: heights.length ? heights.reduce((a, b) => a + b, 0) : 0,
            },
          }
        : {}),
      sourceNodeIds: col.items
        .map((i) => String(i.figmaNode || i.id || ''))
        .filter(Boolean),
      isLayoutContainer: false,
    }
  }

  const leftSec = makeColumnSection(leftCol, 'left')
  const rightSec = makeColumnSection(rightCol, 'right')
  const others = sections.filter((s) => s !== chart && s !== stats)
  const merged = [...others, leftSec, chart, rightSec]
  merged.sort(
    (a, b) => (a.absoluteBoundingBox?.x ?? 0) - (b.absoluteBoundingBox?.x ?? 0),
  )
  return merged
}

export function deriveSectionsFromFigmaTree(figmaNodeData) {
  const doc = figmaNodeData?.document ?? figmaNodeData
  if (!doc || typeof doc !== 'object') return null
  const root = findRootFrame(doc)
  if (!root) return null

  // 🛡️ 图表标记检测（兼容 Figma 常见拼写变体）：
  //   @echarts（正确）/ @eachrts（设计稿拼写错误，mc-1789541776751 实锤）/ @echart / @e-charts。
  //   同时兼容「中文图表类型词」（环形图/饼图/柱状图/折线图/雷达图）——设计稿常不给 @ 前缀，
  //   只靠「环形图」等中文名表意（c-b6a 策略类型分布 @eachrts/环形图 实锤）。
  const isChartMark = (name) => {
    const n = String(name || '')
    if (/@(?:eachrts|echarts?|e-charts|chartjs|charts?|plotly|g2|antv|d3|highcharts|bizcharts|vchart)\b/i.test(n)) return true
    if (/环形图|饼图|柱状图|柱形图|折线图|雷达图|散点图|面积图|漏斗图|仪表盘|仪表图/.test(n)) return true
    return false
  }

  const sections = []
  const backgrounds = []
  const BG_TYPES = new Set([
    'VECTOR',
    'BOOLEAN_OPERATION',
    'RECTANGLE',
    'ELLIPSE',
    'LINE',
    'STAR',
    'POLYGON',
    'REGULAR_POLYGON',
  ])

  // 🛡️ 递归推导辅助函数：判断节点是否应作为 section（而非普通 item）
  // 🛡️ P0 修复（2026-09-17）：添加尺寸过滤，避免装饰性小节点（徽章/图标/色块）被提升为 section
  const shouldPromoteToSection = (node, parentBox) => {
    if (!node || typeof node !== 'object') return false
    const type = String(node.type || '').toUpperCase()
    const name = String(node.name || '')
    
    // 背景/装饰节点不作为 section
    if (BG_TYPES.has(type) || /^bg(\b|[-_])/i.test(name)) return false
    
    // 只处理容器类型：FRAME / GROUP / INSTANCE / COMPONENT / COMPONENT_SET
    const isContainer = ['FRAME', 'GROUP', 'INSTANCE', 'COMPONENT', 'COMPONENT_SET'].includes(type)
    if (!isContainer) return false
    
    const nodeBox = node.absoluteBoundingBox
    if (!nodeBox || !nodeBox.width || !nodeBox.height) return false
    
    const nodeArea = nodeBox.width * nodeBox.height
    
    // 🛡️ P0 修复：绝对尺寸阈值（< 50px² 的节点不提升，避免徽章/图标/色块）
    if (nodeArea < 50) return false
    
    // 🛡️ P0 修复：相对尺寸阈值（< 父节点 3% 的节点不提升，避免装饰性小元素）
    if (parentBox && parentBox.width && parentBox.height) {
      const parentArea = parentBox.width * parentBox.height
      if (parentArea > 0 && nodeArea / parentArea < 0.03) return false
    }
    
    // 有子节点的容器优先提升为 section（已通过尺寸过滤）
    const hasChildren = Array.isArray(node.children) && node.children.length > 0
    if (hasChildren) return true
    
    // 无子节点但面积足够大（> 父节点 15%）也提升
    if (parentBox && parentBox.height && parentBox.width) {
      const parentArea = parentBox.width * parentBox.height
      if (parentArea > 0 && nodeArea / parentArea > 0.15) return true
    }
    
    return false
  }

  // 🛡️ P1 修复（2026-09-17）：收集节点子树所有 Figma 节点 id，作为 section 的 sourceNodeIds。
  //   资源挂载系统（buildResourceMountPlan）依赖 sourceNodeIds 把资源归属到叶子组件；
  //   E1 治本阶段 deriveSectionsFromFigmaTree 替代 vision 后漏写此字段 → ownerOfNode 映射为空
  //   → 所有资源 owner=null 落到 index.vue → 但模板无对应 class → 挂载失败 → 资源变量声明缺失。
  const collectSubtreeNodeIds = (node) => {
    if (!node || typeof node !== 'object') return []
    const id = node.id != null ? String(node.id) : ''
    const ids = id ? [id] : []
    for (const c of node.children || []) {
      if (c && typeof c === 'object') ids.push(...collectSubtreeNodeIds(c))
    }
    return ids
  }

  // 🛡️ 递归推导嵌套 section
  //   返回 { sections, hasNested }：hasNested 表示产出了「嵌套 section」（非 item），
  //   父容器据此决定是否标记 isLayoutContainer（空间包裹容器，不占独立 .vue）。
  const deriveNestedSections = (parentNode, depth = 0) => {
    // 🛡️ 深度保护：最多拆 2 层嵌套（depth 0=顶层 section、1=嵌套区块、2=内容卡片）。
    //   再往下（图标/文字/数字等原子元素）不再拆成 section，作为 item 保留。
    if (depth > 2) {
      const leafKids = (parentNode.children || []).filter((c) => c && typeof c === 'object')
      return { sections: leafKids.map((c) => mapChildNode(c)), hasNested: false }
    }
    
    const parentBox = parentNode.absoluteBoundingBox || null
    const directKids = (parentNode.children || []).filter((c) => c && typeof c === 'object')
    const nestedSections = []
    
    for (const child of directKids) {
      if (!shouldPromoteToSection(child, parentBox)) continue
      
      const type = String(child.type || '').toUpperCase()
      const name = String(child.name || '')
      const box = child.absoluteBoundingBox || null
      const id = String(child.id || '')
      
      const isHeader = /header/i.test(name)
      const isStats = /统计|数据|概览|指标/.test(name)
      const cleanName = name.replace(/^slot-/, '').trim()
      const childKids = (child.children || []).filter((c) => c && typeof c === 'object')
      
      // 图表语义识别：节点自身或直接子节点含图表标记（@echarts/@eachrts/环形图等）
      const hasEcharts = isChartMark(name) || childKids.some((c) => isChartMark(c.name))
      
      // 🛡️ 内容区块语义：header（标题区）与 stats（统计数据区）的子项是「内部内容」
      //   （tabs/小标题/label+数值图例项），不是并列业务 section → 子项 item 化，不递归。
      //   非内容区块容器（slot/con/内容区）才递归推导业务 section。
      const isContentBlock = isHeader || isStats || /图例/.test(name)
      
      // 🛡️ header 语义：标题区内部结构（tabs/小标题/统计项）是 header 的组成部分，
      //   不是并列业务 section → 子节点 item 化，不递归成 section。
      //   非 header 容器（slot/con/内容区）才递归推导业务 section。
      const sub = isContentBlock
        ? { sections: childKids.map((c) => mapChildNode(c)), hasNested: false }
        : deriveNestedSections(child, depth + 1)
      
      const nestedSection = {
        id,
        name: cleanName || name,
        ...(isHeader ? { type: 'header' } : isStats ? { type: 'stats' } : hasEcharts ? { type: 'chart' } : {}),
        figmaNodeId: id,
        // 🛡️ P1 修复（2026-09-17）：sourceNodeIds 收集子树所有节点 id，供资源挂载系统匹配 owner
        sourceNodeIds: collectSubtreeNodeIds(child),
        ...(box ? { absoluteBoundingBox: box } : {}),
        layout: deriveChildLayout(child),
        ...(isHeader ? { header: { title: cleanName || name } } : {}),
        // 🛡️ 纯 chrome 标题栏标记（2026-09-17）：供 planner 在微码流程剥离，
        //   Vue3 流程自行渲染外壳、保留。
        ...(isHeader ? { chromeOnly: headerIsChromeOnly(child) } : {}),
        children: sub.sections,
        // 🛡️ 容器标记：有嵌套业务 section 子节点 → 空间包裹容器（不占独立 .vue）
        ...(sub.hasNested ? { isLayoutContainer: true } : {}),
        styles: {
          flexGrow: 0,
          flexShrink: 1,
          flexBasis: 0,
          ...(box && box.height ? { figmaHeightPx: box.height } : {}),
        },
        // 🆕 标记为嵌套 section（供下游识别）
        isNestedSection: depth > 0,
      }
      
      nestedSections.push(nestedSection)
    }
    
    // 如果没有提升为 section 的子节点，回退到 mapChildNode 保留原始 children 结构
    if (nestedSections.length === 0) {
      return { sections: directKids.map((c) => mapChildNode(c)), hasNested: false }
    }

    // y 升序（视觉从上到下）
    nestedSections.sort(
      (a, b) => (a.absoluteBoundingBox?.y || 0) - (b.absoluteBoundingBox?.y || 0),
    )

    // 🛡️ 图表居中 + 图例分两侧（2026-09-17 · 策略类型分布实锤）：识别
    //   [chart, stats] 两栏中 stats 内部按 x 聚成左右两列、chart 居中的几何关系，
    //   重组为 [left-stats, chart, right-stats]。纯几何、零硬编码、不满足即原样返回。
    const reorganized = reorganizeCenteredChartLayout(nestedSections)
    return { sections: reorganized, hasNested: true }
  }

  // 遍历根节点的直接子节点（顶层 section）
  for (const child of root.children || []) {
    if (!child || typeof child !== 'object') continue
    const type = String(child.type || '').toUpperCase()
    const name = String(child.name || '')
    const box = child.absoluteBoundingBox || null
    const id = String(child.id || '')

    // 背景/装饰：非容器类型，或 name 带 bg 前缀
    if (BG_TYPES.has(type) || /^bg(\b|[-_])/i.test(name)) {
      backgrounds.push({
        id,
        name,
        type: type.toLowerCase(),
        absoluteBoundingBox: box,
      })
      continue
    }

    // section：FRAME / GROUP / INSTANCE / COMPONENT / COMPONENT_SET
    const isHeader = /header/i.test(name)
    const cleanName = name.replace(/^slot-/, '').trim()
    const directKids = (child.children || []).filter((c) => c && typeof c === 'object')
    
    // 图表语义识别：节点自身或直接子节点含图表标记
    const hasEcharts = isChartMark(name) || directKids.some((c) => isChartMark(c.name))
    
    // 🛡️ header 语义：标题区子节点 item 化；非 header 容器递归推导业务 section。
    const sub = isHeader
      ? { sections: directKids.map((c) => mapChildNode(c)), hasNested: false }
      : deriveNestedSections(child, 1)
    
    sections.push({
      id,
      name: cleanName || name,
      ...(isHeader ? { type: 'header' } : hasEcharts ? { type: 'chart' } : {}),
      figmaNodeId: id,
      // 🛡️ P1 修复（2026-09-17）：sourceNodeIds 收集子树所有节点 id，供资源挂载系统匹配 owner
      sourceNodeIds: collectSubtreeNodeIds(child),
      // 🛡️ 关键：absoluteBoundingBox 确定性透传 —— extractLayoutMetadata 的 height 事实源
      ...(box ? { absoluteBoundingBox: box } : {}),
      layout: deriveChildLayout(child),
      ...(isHeader ? { header: { title: cleanName || name } } : {}),
      // 🛡️ 纯 chrome 标题栏标记（2026-09-17）：供 planner 在微码流程剥离。
      ...(isHeader ? { chromeOnly: headerIsChromeOnly(child) } : {}),
      // 🆕 递归推导嵌套 section（核心改进）
      children: sub.sections,
      // 🛡️ 容器标记：非 header 且有嵌套业务 section → 空间包裹容器
      ...(!isHeader && sub.hasNested ? { isLayoutContainer: true } : {}),
      styles: {
        flexGrow: 0,
        flexShrink: 1,
        flexBasis: 0,
        ...(box && box.height ? { figmaHeightPx: box.height } : {}),
      },
    })
  }

  // y 升序（视觉从上到下）
  sections.sort(
    (a, b) => (a.absoluteBoundingBox?.y || 0) - (b.absoluteBoundingBox?.y || 0),
  )

  return {
    sections,
    backgrounds,
    rootName: String(root.name || ''),
    rootId: String(root.id || ''),
  }
}

/** 定位根 FRAME：type=FRAME 且 children 非空；document 本身是 FRAME 时直接返回。 */
function findRootFrame(node) {
  if (!node || typeof node !== 'object') return null
  const t = String(node.type || '').toUpperCase()
  if (t === 'FRAME' && Array.isArray(node.children) && node.children.length > 0) {
    return node
  }
  for (const c of node.children || []) {
    const r = findRootFrame(c)
    if (r) return r
  }
  return null
}

/** 从 Figma layoutMode 推导 section 布局方向（vision 的 layout 字段语义）。 */
function deriveChildLayout(node) {
  const mode = String(node?.layoutMode || '').toUpperCase()
  if (mode === 'HORIZONTAL') return 'horizontal'
  if (mode === 'VERTICAL') return 'vertical'
  // 无 layoutMode：按子节点几何粗略推断（y 相近 → 横向排，x 相近 → 纵向排）
  const kids = (node?.children || []).filter(
    (c) => c && c.absoluteBoundingBox,
  )
  if (kids.length >= 2) {
    const ys = kids.map((c) => c.absoluteBoundingBox.y)
    const xs = kids.map((c) => c.absoluteBoundingBox.x)
    const ySpread = Math.max(...ys) - Math.min(...ys)
    const xSpread = Math.max(...xs) - Math.min(...xs)
    if (xSpread > ySpread) return 'horizontal'
    return 'vertical'
  }
  return 'vertical'
}

/** 子节点 → vision body.children 格式（递归保留嵌套结构，供下游 deriveSectionType/countElements 识别 tab/list/chart）。 */
function mapChildNode(node, depth = 0) {
  if (!node || typeof node !== 'object') return null
  if (depth > 6) return null // 防御深度，避免超深节点树拖慢
  const box = node.absoluteBoundingBox || null
  const kids = (node.children || [])
    .map((c) => mapChildNode(c, depth + 1))
    .filter(Boolean)
  return {
    id: String(node.id || ''),
    name: String(node.name || ''),
    role: 'item',
    figmaNode: String(node.id || ''),
    ...(box ? { absoluteBoundingBox: box } : {}),
    // 🛡️ 2026-09-20（mc-max-1789811323065 自测实锤）：保留 TEXT 节点的文本真值
    //   （Figma 原始字段 characters）。此前被丢弃 → E1 确定性路径下 R2 element-group
    //   的 collectTexts 收不到文本（textTruths=[]）→ 分组又回到「只有名字无内容」，
    //   LLM 无从知道每组分什么 → 卡片内容同源混淆（危化品车51次丢失）。
    //   字段名 text 与视觉分析 schema（item.text）对齐；截断防 prompt 膨胀。
    ...(typeof node.characters === 'string' && node.characters.trim()
      ? { text: node.characters.trim().slice(0, 40) }
      : {}),
    // 🛡️ 2026-09-16：递归保留 children——此前只映射一层，slot-con 内部的
    //   switch/@antd/tab/12卡网格 全丢，组件被简化为「header+content」导致样式混乱。
    ...(kids.length ? { children: kids } : {}),
  }
}

/**
 * 🛡️ E1 治本（样式视觉保真 · 2026-09-16）：语义化样式事实提取。
 *
 * 背景：`extractFigmaColorEssentials` 产出的「颜色真值表」是**无语义扁平列表**——
 * 标注用 Figma 原始 name（`bg`/`VECTOR`/`circle`），设备监测 6 个 tab 的背景全是
 * `bg [VECTOR] → linear-gradient(...)` 一模一样，LLM 无法区分哪个对应哪个 tab →
 * tab-item/设备卡背景消失、颜色错。
 *
 * 治本：把 planner 的**语义树**（effectiveSections 叶子 + sourceNodeIds）与 Figma 精确
 * 样式（fills 渐变/纯色、TEXT 颜色、bbox 尺寸）关联，产出「section 语义 → 内部元素样式」
 * 的结构化事实，注入 prompt 后 LLM 能精确对应到「tabs 的第 2 个 tab 背景 = xx」。
 *
 * 纯函数、无 import.meta，供 prompt-builder / microcode-engineer 共用。
 *
 * @param {Array} treeSections planner effectiveSections 树（含 sourceNodeIds + type 语义）
 * @param {Object} figmaNodeData Figma 节点树（document 或裸根）
 * @param {Object} [opts] { maxLeaves=12, maxItemsPerSection=12, maxDepth=4 }
 * @returns {string} 语义化样式事实文本（markdown），空则 ''
 */
export function buildSectionStyleFacts(treeSections, figmaNodeData, opts = {}) {
  if (!Array.isArray(treeSections) || treeSections.length === 0) return ''
  if (!figmaNodeData || typeof figmaNodeData !== 'object') return ''

  const maxLeaves = opts.maxLeaves ?? 12
  const maxItemsPerSection = opts.maxItemsPerSection ?? 12
  const maxDepth = opts.maxDepth ?? 4

  // 建 Figma 节点索引（id → rawNode）
  const root = figmaNodeData?.document ?? figmaNodeData
  const index = indexFigmaNodes(root)

  // 颜色 → CSS
  const rgbaToCss = (c, opacity) => {
    if (!c || typeof c.r !== 'number') return null
    const r = Math.round(c.r * 255), g = Math.round(c.g * 255), b = Math.round(c.b * 255)
    const op = typeof opacity === 'number' ? Math.round(opacity * 100) / 100 : 1
    return op < 1 ? `rgba(${r},${g},${b},${op})` : `#${((1<<24)+(r<<16)+(g<<8)+b).toString(16).slice(1)}`
  }
  // fills → CSS（纯色优先，其次渐变，带方向 + 透明度）
  const fillsToCss = (fills, fillOpacity) => {
    if (!Array.isArray(fills) || fills.length === 0) return null
    const visible = fills.filter((f) => f.visible !== false)
    const solid = visible.find((f) => f.type === 'SOLID' && f.color)
    if (solid) return rgbaToCss(solid.color, solid.opacity ?? fillOpacity)
    const grad = visible.find((f) => f.type?.startsWith('GRADIENT_') && f.gradientStops?.length >= 2)
    if (grad) {
      const stops = grad.gradientStops
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((s) => `${rgbaToCss(s.color, s.opacity ?? grad.opacity ?? fillOpacity ?? 1)} ${Math.round(s.position * 100)}%`)
        .join(', ')
      const angle = grad.type === 'GRADIENT_LINEAR'
        ? `${gradAngleDeg(grad)}deg, `
        : grad.type === 'GRADIENT_RADIAL' ? 'radial, ' : 'conic, '
      return `linear-gradient(${angle}${stops})`
    }
    return null
  }
  // 🛡️ d70a19bf 实锤：图例条 fill.opacity=0.1 + 同色 1px strokes。此前只记 fills，
  //   描边丢失 → LLM 把半透明底写成不透明 hex，条变成实心色块。
  const strokesToCss = (strokes) => {
    if (!Array.isArray(strokes) || strokes.length === 0) return null
    const visible = strokes.filter((s) => s.visible !== false)
    const solid = visible.find((s) => s.type === 'SOLID' && s.color)
    if (!solid) return null
    return rgbaToCss(solid.color, solid.opacity)
  }
  const gradAngleDeg = (grad) => {
    const h = grad.gradientHandlePositions || []
    if (h.length >= 2) {
      const x0 = h[0].x ?? 0, y0 = h[0].y ?? 0
      const x1 = h[1].x ?? 1, y1 = h[1].y ?? 0
      const dx = x1 - x0, dy = y1 - y0
      if (Math.abs(dx) > 1e-6 || Math.abs(dy) > 1e-6) {
        const deg = (Math.atan2(dy, dx) * 180) / Math.PI
        return Math.round(deg)
      }
    }
    return 180
  }

  // 收集叶子 section（有 type 语义的，容器跳过）
  const leaves = []
  const walkLeaves = (secs) => {
    for (const s of secs || []) {
      if (!s) continue
      if (isLayoutContainerSection(s)) { walkLeaves(s.children); continue }
      leaves.push(s)
    }
  }
  walkLeaves(treeSections)

  const lines = []
  let leafUsed = 0
  for (const sec of leaves) {
    if (leafUsed >= maxLeaves) break
    const type = String(sec.type || '').toLowerCase()
    const ids = Array.isArray(sec.sourceNodeIds)
      ? sec.sourceNodeIds.map(String)
      : (sec.figmaNodeId ? [String(sec.figmaNodeId)] : [String(sec.id)])
    // 该 section 的 Figma 节点集合
    const nodes = ids.map((id) => index.get(id)).filter(Boolean)
    if (nodes.length === 0) continue

    const title = sec.title || sec.name || sec.id
    // 🛡️ 语义标签：type 优先（header/tabs/stats/chart），type 缺失时用 title/name
    //   （cons/active/default 等叶子 type 可能为 undefined，但仍需提取样式事实）
    const label = type && type !== 'container' ? type : title
    const secLines = []
    let itemCount = 0

    // 🛡️ P2（2026-09-17 · e4709ad0 实锤）：sourceNodeIds 含整棵子树时，
    //   12 张同构卡会把 maxItemsPerSection 配额耗在 bg/vector 上，卡片文字色和内部布局进不了 prompt。
    //   治本：只从 section 根（figmaNodeId / id）开始采集；重复同尺寸子项只采样第一张。
    const rootId = sec.figmaNodeId ? String(sec.figmaNodeId) : String(sec.id)
    const startRec = index.get(rootId) || nodes[0]
    const startNodes = startRec ? [startRec] : nodes.slice(0, 1)

    const describeRepeatedItemLayout = (parentNode) => {
      const kids = (parentNode?.children || []).filter((c) => c && c.absoluteBoundingBox)
      if (kids.length < 4) return null
      const w0 = kids[0].absoluteBoundingBox.width
      const h0 = kids[0].absoluteBoundingBox.height
      const similar = kids.filter((k) => {
        const b = k.absoluteBoundingBox
        return Math.abs(b.width - w0) < 8 && Math.abs(b.height - h0) < 8
      })
      if (similar.length < 4) return null
      const sample = similar[0]
      const inner = (sample.children || []).filter((c) => c && c.absoluteBoundingBox)
      if (inner.length === 0) return null
      inner.sort((a, b) => (a.absoluteBoundingBox.x || 0) - (b.absoluteBoundingBox.x || 0))
      const texts = inner.filter((n) => String(n.type || '').toUpperCase() === 'TEXT')
      const icons = inner.filter((n) => /icon/i.test(String(n.name || '')) || String(n.type || '').toUpperCase() === 'GROUP' && /icon/i.test(String(n.name || '')))
      const textBits = texts.map((t) => {
        const color = fillsToCss(t.fills, 1)
        const chars = String(t.characters || '').trim().slice(0, 12)
        const font = t.style?.fontSize ? ` font:${t.style.fontSize}px` : ''
        return `「${chars}」color:${color || '?'}${font}`
      })
      const iconBox = (icons[0] || inner[0])?.absoluteBoundingBox
      const sampleBox = sample.absoluteBoundingBox
      const iconLeft = iconBox && sampleBox && iconBox.x <= sampleBox.x + sampleBox.width * 0.45
      const layout = iconLeft
        ? '横向 flex（容器 flex-direction:row）：左侧 icon，右侧文字列必须为纵向列 flex-direction:column（label 在上、value 在下），禁止把 label/value 横排'
        : '按子节点 x/y 还原，禁止一律 column+居中'
      return `  - 重复单元×${similar.length}（${Math.round(w0)}×${Math.round(h0)}）内部布局 → ${layout}${textBits.length ? `；文字色 ${textBits.join('；')}` : ''}`
    }

    /**
     * 🛡️ Fix1（2026-09-28 · 零硬编码 · 纯几何）：非重复容器的「嵌套列分组」布局事实。
     *
     * 背景（device-monitor `e8c97bf8` 实锤）：switch 两态药丸（active/default）内部真实布局是
     *   `row[ 左列(icon↓title), 右列(stat1↓stat2) ]` —— 几何：icon(1504,483)/title(1500,514)
     *   在 x≈1502 上下堆叠；总数(1550,481)/异常数(1550,510) 在 x=1550 上下堆叠。但真值表此前
     *   只给尺寸+文字色、**无任何方向/分组**，而 `describeRepeatedItemLayout` 仅对「重复单元」生效
     *   → LLM 只能猜，把 4 个子节点按 DOM 序塞进 2×2 grid → 单元格错位（title 跑到右上、line1 跑到左下）。
     *
     * 规则（仅在 section 根、且非重复单元时调用；绝不按组件名/class）：
     * - 取「可见内容子节点」= 有 bbox、面积 < 90% 父面积（排除整块背景层）、
     *   **min(w,h) > 8px**（排除装饰分隔线/细条/圆点 → 必须用 min：362×6 的分隔线 max=362 会漏网）。
     * - 按 x 聚列（容差 max(6, 父宽×4%)）；列数 < 2 → 不输出（单列交给 LLM）。
     * - 按 y 聚行；行数 < 2 → 不输出（单行交给 LLM；也避免把 header 一行统计项误判）。
     * - ⚠️ **仅当「DOM 子节点顺序 ≠ 视觉阅读序（行优先）」时才输出** —— 这正是 LLM
     *   按 DOM 序填 grid 会**单元格错位**的充要条件。DOM 序已与视觉序一致的容器一律不输出
     *   （2026-09-28 全语料实证：无此闸门时命中率 60.3%，头部/普通行都会被误判）。
     * - 命中 → 输出「N 列 × M 行 — 第k列(x≈X，上→下): a → b」。
     */
    const describeContainerLayout = (parentNode) => {
      const pb = parentNode?.absoluteBoundingBox
      if (!pb || !pb.width || !pb.height) return null
      const pArea = pb.width * pb.height
      const content = (parentNode.children || []).filter((c) => {
        const b = c && c.absoluteBoundingBox
        if (!b) return false
        if ((b.width * b.height) / pArea >= 0.9) return false // 整块背景层
        if (Math.min(b.width || 0, b.height || 0) <= 8) return false // 装饰分隔线/细条/圆点
        return true
      })
      if (content.length < 3) return null

      const xTol = Math.max(6, pb.width * 0.04)
      const yTol = Math.max(6, pb.height * 0.04)
      const clusterAxis = (items, axis, tol) => {
        const sorted = [...items].sort(
          (a, b) => a.absoluteBoundingBox[axis] - b.absoluteBoundingBox[axis],
        )
        const clusters = []
        for (const it of sorted) {
          const v = it.absoluteBoundingBox[axis]
          const last = clusters[clusters.length - 1]
          if (last && v - last.max <= tol) {
            last.items.push(it)
            last.max = Math.max(last.max, v)
          } else {
            clusters.push({ min: v, max: v, items: [it] })
          }
        }
        return clusters
      }
      const cols = clusterAxis(content, 'x', xTol)
      const rows = clusterAxis(content, 'y', yTol)
      if (cols.length < 2 || rows.length < 2) return null

      // 视觉阅读序（行优先：先按行簇、再按 x）；与 DOM 序一致 → 不会错位 → 不输出
      const rowIndexOf = new Map()
      rows.forEach((r, i) => r.items.forEach((it) => rowIndexOf.set(it, i)))
      const visual = [...content].sort((a, b) => {
        const ra = rowIndexOf.get(a)
        const rb = rowIndexOf.get(b)
        if (ra !== rb) return ra - rb
        return a.absoluteBoundingBox.x - b.absoluteBoundingBox.x
      })
      if (visual.every((it, i) => it === content[i])) return null

      // 节点摘要：TEXT 取文字；非 TEXT 若有直接 TEXT 子节点则拼其文字；否则用 name
      const nameOf = (n) => {
        if (String(n.type || '').toUpperCase() === 'TEXT') {
          return `「${String(n.characters || '').trim().slice(0, 10)}」`
        }
        const inner = (n.children || [])
          .filter((c) => String(c.type || '').toUpperCase() === 'TEXT')
          .map((c) => String(c.characters || '').trim())
          .join('')
        if (inner) return `「${inner.slice(0, 12)}」`
        return String(n.name || n.type || '?').trim() || '?'
      }
      const colDesc = cols
        .map((col, i) => {
          const items = [...col.items].sort(
            (a, b) => a.absoluteBoundingBox.y - b.absoluteBoundingBox.y,
          )
          return `第${i + 1}列(x≈${Math.round(col.min)}，上→下): ${items.map(nameOf).join(' → ')}`
        })
        .join('；')
      return `  - 内部布局(几何 · 嵌套)：${cols.length} 列 × ${rows.length} 行 — ${colDesc}`
    }

    // 对每个 sourceNode 的子树提取「直接业务子元素」样式（深度受控，累积父 opacity）
    for (const rec of startNodes) {
      const raw = rec.rawNode
      if (!raw) continue
      const repeated = describeRepeatedItemLayout(raw)
      if (repeated) {
        secLines.push(repeated)
        itemCount++
      } else if (!/chart|echarts/.test(type)) {
        // 非重复单元 → 尝试给出「嵌套列分组」几何事实（Fix1）。
        // ⚠️ 图表段跳过：图表轴标签/图例的几何排布会被误读成"嵌套布局"（全语料实证 15 例），
        //    且图表布局另有专用注入链，不应由本事实插手。
        const containerLayout = describeContainerLayout(raw)
        if (containerLayout) {
          secLines.push(containerLayout)
          itemCount++
        }
      }
      // 收集该节点子树的样式条目。parentOpacity 累积：父 GROUP 的 opacity 作用于子节点背景
      const collect = (node, depth, parentOpacity, parentBox) => {
        if (!node || depth > maxDepth || itemCount >= maxItemsPerSection) return
        const name = String(node.name || '')
        const typeN = String(node.type || '').toUpperCase()
        const bbox = node.absoluteBoundingBox
        // 🛡️ 透明度叠加：本节点 opacity 与父 opacity 相乘（缺省视为 1）
        const ownOp = typeof node.opacity === 'number' ? node.opacity : 1
        const effOp = (parentOpacity ?? 1) * ownOp
        const css = fillsToCss(node.fills, effOp)
        const strokeCss = strokesToCss(node.strokes)
        const strokeWeight = Number(node.strokeWeight)
        const isText = typeN === 'TEXT'
        const chars = isText ? String(node.characters || '').trim() : ''
        // 跳过无语义装饰（VECTOR/RECTANGLE 且无渐变），保留有样式价值的节点
        const hasStyle = css || strokeCss || (isText && chars) || (bbox && (bbox.width >= 20 || bbox.height >= 20))
        if (!hasStyle) { for (const c of node.children || []) collect(c, depth + 1, effOp, bbox); return }
        // 去前缀 name
        const clean = normalizeFigmaTextName(name) || name
        const size = bbox ? `${Math.round(bbox.width)}×${Math.round(bbox.height)}` : null
        const parts = []
        if (isText && chars) parts.push(`文字「${chars.slice(0, 12)}」`)
        if (isText) {
          if (css) {
            // 🛡️ 文字色必须是实色（2026-09-27 · bd4f69db 实锤）：Figma 文字节点偶发带**渐变** fill，
            //   旧实现直接写 `color:linear-gradient(...)` —— 非法语义（渐变不可能作文字色），
            //   模型只能瞎猜或照抄。此处降级为**首停靠点实色**并标注来源，保住可执行性。
            if (/gradient\(/i.test(css)) {
              const first = /rgba?\([^)]*\)|#[0-9a-fA-F]{3,8}/.exec(css)
              if (first) parts.push(`color:${first[0]}⚠（原节点 fill 为渐变，文字色取首停靠点实色）`)
            } else {
              parts.push(`color:${css}`)
            }
          }
        } else if (css) {
          // 🛡️ 区分「装饰图元」与「元素/容器底」（2026-09-27 · bd4f69db「一片蓝」实锤）：
          //   图元（circle/path/Vector/小装饰矩形）的 fill 是**绘制用色**，不是元素背景；旧实现一律写
          //   `bg:` → 模型把图元渐变放大成大面积 background（产物 `.c-device-monitor-active-bg
          //   { linear-gradient(180deg,#2b9bff 0%,#299aff 100%) }` 与真值表里 `Rectangle 346241414`
          //   的值**逐字对应**）→ 整片蓝。
          //   判据用**几何面积比**（不猜名字）：占父容器 ≥60% 面积 → 是真实底，仍写 `bg:`；
          //   只占一小块 → 标「图元(非元素背景)」，明确禁止当元素背景实现。
          const parentArea = parentBox ? parentBox.width * parentBox.height : 0
          const ownArea = bbox ? bbox.width * bbox.height : 0
          // 「极小」判据补位：父容器本身也很小（如 8×8 圆点的父级）时面积比会失效 →
          //   绝对尺寸 ≤16px 的一律视为图元（小到不可能是"元素的底"，只能是图标/点/描边）。
          const tiny = !!bbox && Math.max(bbox.width, bbox.height) <= 16
          const coversParent = !tiny && parentArea > 0 && ownArea / parentArea >= 0.6
          parts.push(`${coversParent ? 'bg' : '图元(非元素背景)'}:${css}`)
        }
        if (strokeCss) {
          const w = Number.isFinite(strokeWeight) && strokeWeight > 0 ? `${strokeWeight}px` : '1px'
          parts.push(`描边:${w} ${strokeCss}`)
        }
        if (size) parts.push(`尺寸:${size}`)
        if (typeof node.style?.fontSize === 'number' && node.style.fontSize > 0) parts.push(`font:${node.style.fontSize}px`)
        if (typeof node.style?.fontWeight === 'number' && node.style.fontWeight >= 600) parts.push(`加粗`)
        if (effOp < 1) parts.push(`透明度:${Math.round(effOp * 100) / 100}`)

        // 🛡️ Fix3（2026-09-27 · 零硬编码，几何判定）：纵向文本块提示。
        //   某节点的**直接 TEXT 子节点**同 x（左对齐）且 y 递增（上下堆叠）→ 该容器是
        //   「标签在上、数值在下」的纵向文本块，应还原为 flex-direction:column。旧实现
        //   只给 display:flex（默认 row）会把标签/数值横排挤在一行（实锤 mc-max-1790496527811
        //   设备 cons 区）。纯几何判定，不按组件名/class。
        //
        //   ⚠️ 2026-09-27 收窄（全语料 481 组件实证：2968 命中里 96.2% 是误判）：
        //   仅凭「≥2 个同 x、y 递增的 TEXT 子节点」会把**混合容器**误判成纯文本块 ——
        //   典型如设备卡片 Group(bg + icon + 2 TEXT)（真实布局是 **row：icon 左、文本列右**，
        //   由 describeRepeatedItemLayout 的「横向 flex：左侧 icon，右侧文字列」正确描述）
        //   与装饰图标组 Group 2(vector×N + 2 占位 TEXT)。给这些容器发 column 会与既有
        //   正确提示**互相矛盾**、误导 LLM。故加「无非文本视觉兄弟」前置条件：只有**纯文本块**
        //   （子节点里除这些文本外无具尺寸图元/底衬）才判为纵向文本列。
        const directTextKids = (node.children || []).filter(
          (c) => String(c.type || '').toUpperCase() === 'TEXT' && c.absoluteBoundingBox,
        )
        if (directTextKids.length >= 2) {
          const xs = directTextKids.map((t) => t.absoluteBoundingBox.x)
          const ys = directTextKids.map((t) => t.absoluteBoundingBox.y)
          const sameX = Math.max(...xs) - Math.min(...xs) < 4
          const sortedY = [...ys].sort((a, b) => a - b)
          const increasing = sortedY.every((y, i) => i === 0 || y - sortedY[i - 1] > 2)
          // 纯文本块校验：排除任何具尺寸的非文本兄弟（图元/底衬/图标）
          const textKidSet = new Set(directTextKids)
          const meaningfulNonText = (node.children || []).filter((c) => {
            if (textKidSet.has(c)) return false
            if (String(c.type || '').toUpperCase() === 'TEXT') return false
            const b = c.absoluteBoundingBox
            return b && Math.max(b.width || 0, b.height || 0) > 8
          })
          if (sameX && increasing && meaningfulNonText.length === 0) {
            parts.push('文本块纵向(纯文本块·同x、y递增)：标签在上数值在下 → 该容器用 flex-direction:column')
          }
        }

        if (parts.length > 0) {
          secLines.push(`  - ${clean} → ${parts.join(' | ')}`)
          itemCount++
        }
        // 递归遍历子节点（collect 自身的深度控制保证了安全）
        for (const c of node.children || []) collect(c, depth + 1, effOp, bbox)
      }
      collect(raw, 1, 1, raw.absoluteBoundingBox)
    }

    if (secLines.length > 0) {
      // 🛡️ P1 修复（2026-09-17）：计算 section 背景亮度，指导 LLM 选择正确的文字颜色槽位。
      //   问题：section 切分更细后，某些浅色背景的 section 被独立出来，LLM 用全局 @color-text-base
      //   （dark=#ffffff）写文字颜色，导致浅色背景上白字看不清。
      //   治本：从 Figma 节点树提取该 section 的实际背景色，计算亮度，在 prompt 中标注「浅色背景/深色背景」，
      //   LLM 据此选择 @color-text-base（跟随主题）或硬编码深色/浅色文字。
      let bgBrightnessHint = ''
      for (const rec of nodes) {
        const raw = rec.rawNode
        if (!raw) continue
        // 找第一个可见的纯色/渐变背景
        const fills = Array.isArray(raw.fills) ? raw.fills.filter((f) => f.visible !== false) : []
        const solid = fills.find((f) => f.type === 'SOLID' && f.color)
        if (solid) {
          const c = solid.color
          const r = Math.round(c.r * 255), g = Math.round(c.g * 255), b = Math.round(c.b * 255)
          // 相对亮度公式（WCAG）
          const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
          bgBrightnessHint = luminance > 0.5 ? '（浅色背景，文字用深色）' : '（深色背景，文字用浅色）'
          break
        }
        // 渐变取第一个 stop 的亮度
        const grad = fills.find((f) => f.type?.startsWith('GRADIENT_') && f.gradientStops?.length >= 2)
        if (grad) {
          const firstStop = grad.gradientStops[0]
          if (firstStop && firstStop.color) {
            const c = firstStop.color
            const r = Math.round(c.r * 255), g = Math.round(c.g * 255), b = Math.round(c.b * 255)
            const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
            bgBrightnessHint = luminance > 0.5 ? '（浅色背景，文字用深色）' : '（深色背景，文字用浅色）'
            break
          }
        }
      }
      // 🛡️ 段首禁令（2026-09-27 · bd4f69db「一片蓝」实锤）：只在**首段**注入一次（控 token）。
      //   缺这条时，模型会把「图元(非元素背景)」行也当元素底色实现 → 满屏渐变蓝。
      if (leafUsed === 0) {
        lines.push(
          '> ⚠️ 逐节点样式真值：**只有 `bg:` 行是元素/容器底色**；标「图元(非元素背景)」的行是绘制用色' +
            '（描边/渐变块/小图标），**禁止实现为大面积 background**。文字色只允许实色。' +
            '**下表未给出的属性，该元素一律不得添加**（禁止用示例色或臆造色补齐）。' +
            '**透明度归属铁律**：每个节点的 `透明度:X` 只作用于**该节点自身图层**（写在该节点自己的样式上）；' +
            '**严禁把子节点透明度上提到父容器/公共祖先**（否则父组挂 opacity 会与 PNG 自身透明叠加成双重透明，' +
            '整片发灰发蓝）。背景层若需半透明，应体现在 background 的 alpha 通道或背景子层，不得上提父级。',
        )
      }
      lines.push(`**${label}**${bgBrightnessHint}（内部元素样式真值）：`)
      lines.push(...secLines.slice(0, maxItemsPerSection))
      leafUsed++
    }
  }

  return lines.length > 0 ? lines.join('\n') : ''
}

/**
 * 🛡️ 中文语义名 → 英文 class 关键词映射（2026-09-16 治本）。
 *
 * 背景：Figma 节点名常是中文（「中间图表」「统计数据」），但产物 class 是英文
 * （`chart-container`/`stats-grid`）。N3 bg 强制挂载用 `wordsOf(mountTarget)` 匹配 class，
 * 中文「中间图表」永远匹配不到英文 `chart-container` → 环形图背景挂载失败
 * （c-b6a 策略类型分布 bg-环形图背景实锤）。
 *
 * 本映射把中文语义名展开为「中文词 + 英文词」两个 token 集合，供挂载匹配与 class 派生共用，
 * 消除中英文语义鸿沟。纯函数、无 import.meta。
 *
 * @param {string} raw 中文/英文语义名
 * @returns {string[]} 英文 class 关键词（去重，含原始英文片段）
 */
export function semanticClassKeywords(raw) {
  const zh = String(raw || '').trim()
  if (!zh) return []
  const MAP = {
    中间图表: ['chart'],
    图表: ['chart'],
    统计数据: ['stats'],
    统计: ['stats'],
    数据: ['data'],
    列表: ['list'],
    网格: ['grid'],
    卡片: ['card'],
    内容: ['content'],
    主体: ['main'],
    正文: ['body'],
    侧边: ['sidebar'],
    导航: ['nav'],
    工具栏: ['toolbar'],
    底部: ['footer'],
    顶部: ['header'],
    标题: ['header', 'title'],
    图例: ['legend'],
  }
  const out = new Set()
  for (const [k, en] of Object.entries(MAP)) {
    if (zh.includes(k)) en.forEach((w) => out.add(w))
  }
  // 保留原始英文/拼音片段
  const ascii = zh
    .replace(/^slot-?/i, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2);
  ascii.forEach((w) => out.add(w.toLowerCase()))
  return [...out]
}

/**
 * Figma fill → rgba() 字符串（供视觉分析 hint / 颜色真值表使用）。
 *
 * 🛡️ 治本（2026-09-18 · mc-max-1789646258134-d21c0618）：fill 级透明度丢失。
 * Figma SOLID fill 结构 = { color: {r,g,b,a}, opacity }，其中 color.a 几乎恒为 1，
 * 真正的图层级透明度在 fill.opacity。旧 visual-parser 只取 color.a → 半透明卡片背景
 * （fill.opacity=0.10）被输出成不透明全饱和色 rgba(...,1) → LLM 把浅色底满铺、文字叠深底。
 * 本函数统一口径：fill.opacity 优先于 color.a，二者都缺省则 1，透明度 round 到 2 位小数
 * （吞掉 Figma 返回的 0.10000000149011612 浮点尾差）。与
 * figma-connector._rgbaToHex / prompt-builder.toCssColor / 本文件 rgbaToCss 口径一致。
 *
 * @param {{ color?: {r?:number,g?:number,b?:number,a?:number}, opacity?:number }} fill
 * @returns {string|null} rgba(r,g,b,a)；颜色缺失时 null
 */
export function fillToRgba(fill) {
  const c = fill && typeof fill === 'object' ? fill.color : null
  if (!c || typeof c.r !== 'number') return null
  const r = Math.round(c.r * 255)
  const g = Math.round(c.g * 255)
  const b = Math.round(c.b * 255)
  const rawOp = fill.opacity !== undefined ? fill.opacity : (c.a !== undefined ? c.a : 1)
  const op = Math.round(rawOp * 100) / 100
  return `rgba(${r},${g},${b},${op})`
}
