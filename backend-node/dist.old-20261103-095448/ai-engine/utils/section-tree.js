/**
 * 🛡️ A′ Phase 5：effectiveSections 嵌套树遍历。
 * 容器（isLayoutContainer / layoutSource=container-rebuild）只负责空间包裹，不占独立 .vue。
 * 纯函数、无 import.meta，供 planner / prompt / COMP-001 / assembler 共用。
 */

// 🛡️ 2026-10-21 刀 42：`effects → box-shadow` 收敛为**单一来源**。
//   原先本文件内联了一份实现（prompt 下发用），而刀 42 的自愈链也需要同一份真值 ——
//   两份实现必然漂移（记忆铁律：同判据 ≥2 份 = 事故温床）。差异只有颜色写法
//   （本文件 alpha=1 时输出 hex，共享实现恒 rgba），二者被 normalizeCssColor 归一为同一 token。
import { effectsToBoxShadow } from './figma-effects.js';

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
      // vision 的独立页脚不是共享锚点的重复解释。锚点可能误指正文节点，
      // 不能再用 elementCount 裁决删除 footer；结构保留，几何修复留给 planner。
      if (String(sec.type || '').toLowerCase() === 'footer') {
        out.push(sec)
        continue
      }
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
    // 🛡️ 2026-09-29（c-env-monitor-4ec44f1c 实锤）：措辞兜底必须与规则①**同语义** ——
    //   只有「归属冲突」（sourceNodeIds 有交集）或「归属缺失」（一方 src 为空）时，
    //   type/responsibility 相同才足以认定是「同一区域的重复解释」。
    //   两个 section 都有**完整且互不重叠**的归属 ⇒ 它们是空间上不同的区域（本例 tabs-list 与
    //   tabs-icon 同被 planner 粗粒度标为「标签页切换区」，elementCount 6 vs 8）⇒ 不得折叠。
    //   误折叠的代价：被折叠 section 的 sourceNodeIds 连同其资源节点一并失去 section 归属 ⇒
    //   resource-mount-plan#resolveSectionAnchor 沿 figma 祖先链退化到祖先容器 ⇒ 资源错挂父容器
    //   （bg-7890 落到 89:42 而非 2:7889），sub-state 背景（bg-tab-active）因目标已被占用而整体放弃。
    const type = String(sec.type || '').toLowerCase()
    if (type === 'tabs') {
      const key = `tabs|${String(sec.responsibility || '').trim()}`
      if (seen.has(key)) {
        const prevIdx = seen.get(key)
        const prev = out[prevIdx]
        const prevIds = new Set(
          (Array.isArray(prev?.sourceNodeIds) ? prev.sourceNodeIds : []).map((s) => String(s)),
        )
        const hasOverlap = srcIds.some((id) => prevIds.has(id))
        const anyEmpty = srcIds.length === 0 || prevIds.size === 0
        if (hasOverlap || anyEmpty) {
          const prevCount = Number(prev?.elementCount) || 0
          const curCount = Number(sec.elementCount) || 0
          if (curCount > prevCount) out[prevIdx] = sec
          continue
        }
        // 判为「不同区域」→ 两个都保留，落到下方公共 push 路径；并让后续同 key 与**最新**者比较
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
    if (srcIds.length === 0 && !['header', 'footer', 'table'].includes(rec.type)) shells.push(rec)
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
    // ② 成员宽 ≥ 40px（排除轴条/刻度）
    if (!sameRow.every((m) => (nodeBox(m).width || 0) >= 40)) return false;
    // ⑤ ★ 成员「等宽」（确定性几何事实，替代旧「宽和<70%」的内容猜测）：
    //   卡片组的本质是两卡等宽（实锤 1263:38 两卡 card 192=192）。容差 2px 或 5%。
    const ws = sameRow.map((m) => nodeBox(m).width || 0);
    const maxW = Math.max(...ws);
    const minW = Math.min(...ws);
    if (maxW - minW > 2 && maxW > 0 && (maxW - minW) / maxW > 0.05) return false;
    // ② ★ 成员「含 1~3 条文本」（允许含 bg/图形层 —— 卡内常带 bg-[m] 背景层）：
    //   旧「只含 TEXT」判据对含背景层的卡片必然不命中 ⇒ B′ 0 命中。
    //   图表刻度/轴条无文本 ⇒ 被「含文本」排除（且上面「宽≥40」已先拦轴条）。
    const memberOk = (m) => {
      const stack = [m];
      let textCount = 0;
      while (stack.length) {
        const c = stack.pop();
        if (!c || typeof c !== 'object') continue;
        if (c.type === 'TEXT') textCount += 1;
        if (Array.isArray(c.children) || Array.isArray(c?.rawNode?.children)) for (const k of (c.children || c.rawNode.children)) if (k) stack.push(k);
      }
      return textCount >= 2 && textCount <= 20;
    };
    if (!sameRow.every(memberOk)) return false;
    // ② ★ 结构同构：所有成员文本数一致（卡片=标题+数值；header 与 @echarts 图表文本数不同 → 拒）
    const counts = sameRow.map((m) => {
      const stack = [m];
      let n = 0;
      while (stack.length) {
        const c = stack.pop();
        if (!c || typeof c !== 'object') continue;
        if (c.type === 'TEXT') n += 1;
        if (Array.isArray(c.children) || Array.isArray(c?.rawNode?.children)) for (const k of (c.children || c.rawNode.children)) if (k) stack.push(k);
      }
      return n;
    });
    if (new Set(counts).size !== 1) return false;
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
 * 收集节点子树内的文本事实（**命名无关**，唯一事实源）。
 *
 * 🔴 设计契约（2026-09-30，用户明确纠正）：**文本处理必须命名无关**。
 *   判据只能是「节点 type 是否 TEXT / CHARACTER」，**禁止**用图层名（`t-` / `d-` / 裸 `t`）
 *   判文本的类别或角色；命名**只允许**用于 ① 资源类型（`bg` / `icon` / `img`）
 *   ② `@` 技术栈标记（如 `@antd/tab`）。
 *   原话：「是文字就输出拿到样式输出文字，不用依赖命名」。
 *   ⇒ 本函数**不再产出 `isTitle`**（旧实现 `/^[tT]-/.test(raw)` 已删）；
 *     文本角色（标题/数值）改由消费端用 `splitTitleValueByStyle` 按**样式真值**判定。
 *
 * 三类真值，各取各的源头（都在 Figma TEXT 节点自身）：
 *   · 文案真值 = `characters`（trim 后非空）→ 回退 `normalizeFigmaTextName(name)`。
 *     为什么必须优先 characters：实锤 `c-traffic-monitor-6d7082a1` §2:3446（当日总流量卡）
 *     的「客车」「货车」TEXT 图层名是单字母 `t`，真文案在 `characters`；邻居 §2:3496
 *     （车型分布卡）的图层名**恰好就是文本本身**。只读 `name` ⇒ §2:3446 真值文本全丢
 *     ⇒ 独占性守卫误判「借用了 §2:3496 的客车/货车」⇒ 自愈器把**本属于自己的**文本删掉。
 *   · 样式真值 = `style.fontSize` / `style.fontWeight`（figma-connector 白名单保留，实测覆盖率 100%）。
 *   · 几何真值 = TEXT 节点自身 `bbox.x` / `bbox.y`。
 *
 * 去重键 = 文本本身（旧的 `${isTitle?'t':'d'}:${text}` 随 isTitle 一并删除；
 *   全语料 A/B 实测此变化对产物影响 = 0 —— 不存在「同文本一 t- 一 d-」的子树）。
 */
export function collectSubtreeTexts(nodeId, index, childrenOf = buildChildrenMap(index)) {
  const out = []
  const seenTexts = new Set()
  const seen = new Set()
  const walk = (id) => {
    const keyId = String(id)
    if (seen.has(keyId)) return
    seen.add(keyId)
    const node = index?.get(keyId)
    if (!node) return
    if (node.type === 'TEXT' || node.type === 'CHARACTER') {
      const raw = String(node.name || '')
      const chars = typeof node.rawNode?.characters === 'string' ? node.rawNode.characters.trim() : ''
      const text = chars || normalizeFigmaTextName(raw)
      if (text && !seenTexts.has(text)) {
        seenTexts.add(text)
        const style = node.rawNode?.style || {}
        const fontSize = Number(style.fontSize)
        const fontWeight = Number(style.fontWeight)
        out.push({
          text,
          x: typeof node.bbox?.x === 'number' ? node.bbox.x : null,
          y: typeof node.bbox?.y === 'number' ? node.bbox.y : null,
          fontSize: Number.isFinite(fontSize) && fontSize > 0 ? fontSize : null,
          fontWeight: Number.isFinite(fontWeight) && fontWeight > 0 ? fontWeight : null,
        })
      }
    }
    for (const childId of childrenOf?.get(keyId) || []) walk(childId)
  }
  walk(nodeId)
  return out
}

/**
 * 成员子树「标题 / 数值」的**命名无关**判定（唯一事实源）。
 *
 * 依据（全部来自 `collectSubtreeTexts` 的三类真值，**零图层名参与**）：
 *   ① 样式真值：字号大者 = 数值 —— 与 prompt 既有铁律「标题=位置小字、数值=大字」同口径；
 *   ② 几何兜底：字号并列/缺失时，纵向堆叠（y 不同）靠下者 = 数值；
 *   ③ ①② 都不可分辨 ⇒ 返回 `null`（**不臆造**，调用方按「无角色」处理）。
 *
 * 只处理**恰好 2 个文本**的子树（统计卡片的真值形态）；其余形态返回 `null`。
 *
 * @param {Array<{text:string,fontSize:number|null,y:number|null}>} items collectSubtreeTexts 结果
 * @returns {{title:string,value:string,by:'style'|'geometry'}|null}
 */
export function splitTitleValueByStyle(items) {
  if (!Array.isArray(items) || items.length !== 2) return null
  const [a, b] = items
  if (a.fontSize != null && b.fontSize != null && a.fontSize !== b.fontSize) {
    const value = a.fontSize > b.fontSize ? a : b
    const title = value === a ? b : a
    return { title: title.text, value: value.text, by: 'style' }
  }
  if (a.y != null && b.y != null && a.y !== b.y) {
    const value = a.y > b.y ? a : b
    const title = value === a ? b : a
    return { title: title.text, value: value.text, by: 'geometry' }
  }
  return null
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
  
  // 🛡️ 文本真值下发（2026-09-29 · mc-max-1790650861294-f57e0d3e 实锤；原 tabs 专用增强
  //   2026-09-21 · c-env-monitor 实锤保留其措辞）：
  //   原实现**只对 `sec.type === 'tabs'`** 打印 `body.items` 文本 ⇒ 其余 type（header / 空
  //   type / card）一律不下发，LLM 只能从 buildTextTruthWhitelist 的「散文本池」里猜归属
  //   ⇒ 内容层三大现象同源：tab 整条消失（2:3565）、双数字卡被猜成环形卡（2:3680/2:3683）、
  //   图表小标题缺失（2:7625/2:7794）。
  //   治本（两级、确定性）：
  //     ① 结构化 TEXT 真值：递归 section.children（E1 由 figma 树确定性产出，mapChildNode 已
  //        给 TEXT 节点带 `text = characters`）→ 天然只命中真正的 TEXT 节点，且带 bbox 可
  //        按 y 排序还原**视觉阅读序**（修 figma 数组序 ≠ 视觉序，如 2:3683 的「数字在前」）。
  //        这一步同时消解了 vision 把整组 tab 合并成单串的问题（`2:3566 @antd/tab` 被 vision
  //        命名为「江阴靖江长江隧道江阴大桥」）——递归后拆回两个真实 TEXT。
  //     ② 回退：vision 下发的 `body.items` / `body.children` 名称（`body.children` 是
  //        preview-analysis schema 的字段名，与 `body.items` 是同一事实的两种命名，
  //        只读后者会整段读不到 → 必须两者都读）。
  //   过滤：纯 figma 节点 id（`2:3681`）与 figma 默认图层名（Rectangle 26 等）；最多 6 项、
  //   每项 24 字符。图表 section（type=chart）不加文本项——其内部轴标签属 echarts option。
  let tabsNote = ''
  {
    const isChartSec = String(sec.type || '') === 'chart' || !!sec.chartType
    // 🛡️ 图表 section 一律不下发文本项：其内部文本（图例「北京方向/上海方向」、轴标签
    //   「4000/辆/时」）属 echarts option，写进模板会变成容器外的游离 DOM
    //   （视觉分析 prompt 亦明令「禁止把图例拆成 section 的兄弟文本节点」）。
    if (!isChartSec) {
      // ① 结构化 TEXT 真值（视觉序）
      const textHits = []
      const collectTexts = (node, depth) => {
        if (!node || typeof node !== 'object' || depth > 5) return
        if (typeof node.text === 'string' && node.text.trim()) {
          textHits.push({
            t: node.text.trim(),
            y: node.absoluteBoundingBox?.y,
            x: node.absoluteBoundingBox?.x,
          })
        }
        for (const c of node.children || []) collectTexts(c, depth + 1)
      }
      for (const c of Array.isArray(sec.children) ? sec.children : []) collectTexts(c, 0)
      // ② 回退：vision / planner 下发的 body.items（`body.children` 是其同义字段名）
      const fallback = [
        ...(Array.isArray(sec.body?.items) ? sec.body.items : []),
        ...(Array.isArray(sec.body?.children) ? sec.body.children : []),
      ].map((item) => (typeof item === 'string' ? item : item?.text || item?.name))

      const raw = textHits.length > 0
        ? textHits
            // 视觉阅读序：先 y（自上而下）后 x（同行自左向右），与设计稿阅读序一致
            .sort((a, b) => (a.y ?? Infinity) - (b.y ?? Infinity) || (a.x ?? Infinity) - (b.x ?? Infinity))
            .map((h) => h.t)
        : fallback

      let itemTexts = raw
        .map((t) => String(t == null ? '' : t).trim())
        .filter(
          (t) =>
            t &&
            !/^\d+:\d+$/.test(t) &&
            !/^(Rectangle|Ellipse|Vector|Union|Group|Frame|Line|Star|Path)\s*\d*$/i.test(t) &&
            !/^(椭圆|矩形|路径|线段|光)\s*\d*$/.test(t),
        )
        .filter((t, i, arr) => arr.indexOf(t) === i) // 多来源合并后去重

      // 🛡️ 合并名去重：vision 常把一整组 tab 命名成拼接串（如「江阴靖江长江隧道江阴大桥」），
      //   而递归 TEXT 真值已把它拆成两项 ⇒ 该拼接串是冗余项，丢弃（纯字符串判据，命名无关）。
      itemTexts = itemTexts.filter((t, _i, arr) => {
        return !arr.some(
          (a) =>
            a !== t &&
            arr.some((b) => b !== t && b !== a && (a + b === t || b + a === t || `${a} ${b}` === t)),
        )
      })

      const limited = itemTexts
        .slice(0, 6) // 最多展示 6 个，避免 prompt 过长
        .map((t) => (t.length > 24 ? `${t.slice(0, 24)}…` : t))
      if (limited.length > 0) {
        tabsNote =
          sec.type === 'tabs'
            ? `，标签项 [${limited.join('、')}]`
            : `，文本项 [${limited.join('、')}]`
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
      //
      // 🛡️ 2026-09-30 复审 §8.8 #8：判据改**三态**，对齐写产物层 `code-generator.js:648-661`
      //   的既有范式（那处已是 `layoutKind ∈ {horizontal,vertical,grid}` 否则 **null 且不内联方向**）。
      //   旧实现是二值三元（`sec.layout || 'vertical'` + `=== 'horizontal'`）⇒ `grid` / 未知取值 /
      //   无事实一律被说成「纵向（flex-direction: column）」，与写产物层**口径不一致**。
      //   现：row / column / grid / **null（不断言方向）**。
      //   ⚠️ 容器取值域今天只有 {horizontal, vertical}（live 口径 864 个：h 495 / v 369）
      //   ⇒ `|| 'vertical'` 与 grid/null 分支**当前 0 命中** ⇒ 本次改动**零行为变化**（堵未来）。
      const rawDir = String(sec.layout ?? '').toLowerCase()
      // 与 `subcomponent-planner.js#extractLayoutMetadata` 同一口径：**前缀**匹配
      // （真实语料存在 `horizontal-2-columns` / `horizontal-3-items` 这类变体）
      const layoutKind = rawDir.startsWith('horizontal')
        ? 'row'
        : rawDir === 'row'
          ? 'row'
          : rawDir.startsWith('vertical')
            ? 'column'
            : rawDir === 'column'
              ? 'column'
              : rawDir.startsWith('grid')
                ? 'grid'
                : null
      const dirText =
        layoutKind === 'row'
          ? '横向（flex-direction: row）'
          : layoutKind === 'column'
            ? '纵向（flex-direction: column）'
            : layoutKind === 'grid'
              ? '网格（display: grid，列数由系统注入）'
              : '方向未知（按子区块顺序自然排布）'
      const wrapNote =
        layoutKind === 'row' || layoutKind === 'column'
          ? `父模板必须按 ${layoutKind} 包住下列子组件`
          : '父模板按子区块顺序自然包裹即可（方向由系统按布局事实注入）'
      lines.push(
        `${pad}- 容器 \`${sec.id}\`（${title}）：${dirText} flex 包裹，不单独生成 .vue。子区块顺序 [${childIds}]。${wrapNote}，禁止打平。`,
      )
      // 🛡️ #78 S2：容器也可能带 techStack 标注（祖先链/直接命中未吸收形态），同步提示
      if (sec.techStack) {
        lines.push(formatTechStackContract(sec, indent + 1))
      }
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
      // 🛡️ #78 技术栈接管（S2+S3）：数据驱动标记（@antd/table 等）命中 section，
      //   下发确定性 columns/dataSource/rowSelection 契约，禁止手写还原内部结构。
      if (sec.techStack) {
        lines.push(formatTechStackContract(sec, indent + 1))
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
 * 🛡️ #78 技术栈接管契约（S2+S3，2026-10-01 · mc-max-1790830432735-07a812f7 实锤）：
 *   把 techstack-section-contract 挂到 sec.techStack 的事实渲染成 prompt 契约。
 *   - direct + table 契约：完整 columns/dataSource/rowSelection（照 itemSkeleton 的
 *     「确定性契约注入」样板，LLM 禁止改写结构）；
 *   - direct（非表格）：组件标签提示（select/input 等数据驱动组件）；
 *   - ancestor-chain：轻量警示（本区块位于某数据驱动组件区域内部，勿手写内部网格）。
 */
function formatTechStackContract(sec, indent) {
  const ts = sec?.techStack
  if (!ts) return ''
  const pad = '  '.repeat(indent)
  const lines = []
  const markerText = `\`@${ts.library}/${ts.component}\`（节点 \`${ts.nodeId ?? '未知'}\`）`

  // ── 控件契约（button/control，P3-15b 孤儿重建）──
  if ((ts.via === 'orphan-rebuild' || ts.via === 'direct') && ts.contract && ts.contract.kind !== 'table') {
    const c = ts.contract
    const tag = ts.tag || '组件'
    const s = c.style || {}
    const styleParts = []
    if (s.width && s.height) styleParts.push(`尺寸 ${s.width}×${s.height}px`)
    if (s.background) styleParts.push(`底色 ${s.background}`)
    if (s.borderRadius) styleParts.push(`圆角 ${s.borderRadius}px`)
    if (s.textColor) styleParts.push(`文字色 ${s.textColor}`)
    if (s.fontSize) styleParts.push(`字号 ${s.fontSize}px`)
    if (s.fontWeight) styleParts.push(`字重 ${s.fontWeight}`)
    lines.push(`${pad}▼ 控件契约（确定性事实，禁止改写）：`)
    lines.push(
      `${pad}本区块对应 Figma ${markerText} ⇒ 用 \`<${tag}>\` 渲染${c.text ? `，文案「${c.text}」必须作为 <${tag}> 的**直接内容**（<${tag}>…>${c.text}</${tag}>），禁止留空标签/空 span 占位` : ''}。`,
    )
    if (styleParts.length > 0) {
      lines.push(
        `${pad}外观真值：${styleParts.join('、')} —— 全部用 wrapper class / inline style 承载（颜色用确切 hex，不得近似），禁止 :deep 穿透控件内部，禁止手画图标/圆圈。`,
      )
    }
    // 🛡️ P3-15d：位置事实（防 LLM 自由摆放——按钮跑到右下角实锤）。偏差值随设计稿动态计算。
    //   🛡️ P3-15e（2026-10-01 · 用户截图实锤「footer 包装层不居中」）：位置约束必须覆盖包装层。
    if (s.align === 'center') {
      lines.push(
        `${pad}位置真值：该控件在父容器内**水平居中**（实测中心偏差 ${s.alignDevPx ?? 0}px）⇒ 控件及其**任何包装 div** 都必须水平居中（align-self:center 或 margin:0 auto），禁止 float/绝对定位靠边。`,
      )
    } else if (s.align === 'right') {
      lines.push(
        `${pad}位置真值：该控件在父容器内**靠右**（实测中心偏差 ${s.alignDevPx ?? '?'}px）⇒ 控件及其包装 div 用 align-self:flex-end。`,
      )
    } else if (s.align === 'left') {
      lines.push(
        `${pad}位置真值：该控件在父容器内**靠左**（实测中心偏差 ${s.alignDevPx ?? '?'}px）⇒ 控件及其包装 div 用 align-self:flex-start。`,
      )
    }
    if (s.marginTop) {
      lines.push(`${pad}位置真值：与上方区块的垂直间距 ${s.marginTop}px（margin-top）。`)
    }
    return lines.filter(Boolean).join('\n')
  }

  // ── 表格契约（direct + table）──
  if (ts.via === 'direct' && ts.contract && ts.contract.kind === 'table') {
    const c = ts.contract
    const tag = ts.tag || '表格组件'
    const s = c.style || {}
    lines.push(`${pad}▼ 技术栈接管契约（确定性事实，禁止改写）：`)
    lines.push(
      `${pad}本区块对应 Figma ${markerText} ⇒ 必须用 \`<${tag}>\` 渲染整个表格；禁止用 <div> 手写表格内部结构（列等分 / 单元格框 / 表头背景）。`,
    )
    lines.push(`${pad}columns（${c.columnCount} 列，宽度为 Figma 实测 px，列序不可换）：`)
    for (const col of c.columns) {
      lines.push(`${pad}  - { title: '${col.title}', dataIndex: '${col.dataIndex}', width: ${col.width} }`)
    }
    // 🛡️ P3-15e（2026-10-01 · 用户截图实锤「表格上方臆造出 3 个张斌 tab 按钮」）：
    //   dataSource 是**行数据**，禁止被诠释成 tab/切换器/按钮组等设计中不存在的交互元素。
    lines.push(
      `${pad}本区块**只渲染表格本身**：dataSource 仅用于表格行渲染，禁止在表格上方/下方添加设计中不存在的 tab 切换、按钮组、分段控制器等任何交互元素。`,
    )
    lines.push(`${pad}dataSource（${c.rowCount - 1} 行真值文本；字段名可改语义命名，但列绑定必须一一对应）：`)
    lines.push(`${pad}\`\`\``)
    lines.push(`${pad}const dataSource = ${JSON.stringify(c.dataSource)}`)
    lines.push(`${pad}\`\`\``)
    if (c.rowSelection) {
      // 🛡️ P3-15d（用户截图实锤）：设计形态是 radio 与第一列文本**同格**，antd 的
      //   rowSelection prop 必然把选择列独立出来（多出空表头列）⇒ 明确禁用 prop，
      //   改用第一列 #bodyCell 自定义渲染。
      // 🛡️ 2026-10-03（39dce24a 实锤）：LLM 用 <img> 画选择控件且选中态分支无 src（破图）⇒
      //   明确只允许真实组件，禁止 img/手绘圆圈顶替。
      lines.push(
        `${pad}行选择：radio 与第一列文本**同格**（同一单元格）⇒ **不用 rowSelection prop**（它会把选择列独立出来、多出空表头列，与设计不符）；在第一列（dataIndex: '${c.columns[0]?.dataIndex || 'field1'}'，即「${c.columns[0]?.title || ''}」列）的 #bodyCell 里渲染**真实组件** \`<a-radio :checked="<行选中字段>"/>\`（多选形态用 \`<a-checkbox>\`）+ 文本，选中态用响应式变量。❌ **绝对禁止**用 <img>/图标/手绘圆圈（Ellipse/边框圆点）顶替选择控件，禁止产出无 src 的 <img>。`,
      )
    }
    // 🛡️ P3-15d：宽度事实（防表格靠左/固定窄宽）
    if (s.fullWidth) {
      lines.push(
        `${pad}宽度真值：表格**撑满父容器**（真值 ${s.width || '100%'}px = 父宽 100%）⇒ wrapper 用 width:100%，禁止 width:fit-content / 固定窄宽。`,
      )
    } else if (s.width) {
      lines.push(`${pad}宽度真值：表格固定 ${s.width}px（Figma 实测）。`)
    }
    // 🛡️ P3-15 表格样式契约（2026-10-01 · 用户截图实锤斑马纹/表头底色/单元格背景丢失）：
    //   色值全部来自 node fills/strokes 真值（非视觉猜测）；出口 = 公开 API + 唯一 :deep 白名单
    const styleLines = []
    if (s.rowHeight) styleLines.push(`数据行高 ${s.rowHeight}px（用 rowClassName + wrapper class 控制，禁止 :deep 改行高）`)
    if (s.align === 'center') styleLines.push('单元格与表头内容居中（#headerCell/#bodyCell slot 或 class）')
    if (s.headerBg) styleLines.push(`表头底色 ${s.headerBg}${s.headerFontWeight ? `（字重 ${s.headerFontWeight}）` : ''} —— 唯一允许的 :deep 白名单：.ant-table-thead > tr > th 的 background，仅此一处`)
    if (s.zebraBg) {
      const rows = Array.isArray(s.zebraRows) && s.zebraRows.length > 0 ? s.zebraRows.join('、') : null
      styleLines.push(
        `斑马纹方向 = 横向（按数据**行**交替，整行同色），禁止纵向/按列斑马：数据第 ${rows || '偶数'} 行底色 ${s.zebraBg}，其余行 ${s.cellBg || '白色'}（用 :row-class-name 公开 API 按行 index 判定 + wrapper class，禁止 :deep）`,
      )
    } else if (s.cellBg) {
      styleLines.push(`数据行底色 ${s.cellBg}（wrapper class）`)
    }
    if (s.borderColor) styleLines.push(`表格线为极淡 hairline（真值色 ${s.borderColor}，1px）⇒ 以横向行分隔线为主，竖向列线（如有）同色同粗，禁止粗重/深色边框`)
    if (s.textColor) styleLines.push(`正文文字色 ${s.textColor}`)
    if (styleLines.length > 0) {
      lines.push(`${pad}表格样式契约（Figma 真值色值，逐条还原）：`)
      for (const l of styleLines) lines.push(`${pad}  - ${l}`)
    }
  } else if (ts.via === 'direct') {
    lines.push(
      `${pad}⚠️ 本区块对应 Figma ${markerText} ⇒ 用 <${ts.tag || '对应组件'}> 渲染，禁止手写还原其内部构造与内部样式。`,
    )
  } else if (ts.via === 'ancestor-chain') {
    lines.push(
      `${pad}⚠️ 本区块位于 Figma ${markerText} 区域内部：该组件的内部网格/列等分/单元格结构由组件库渲染，禁止在本区块手写还原${ts.tag ? `（语义上属于 <${ts.tag}> 区域）` : ''}。`,
    )
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
  /** 组件实例/组件定义 ⇒ 一定承载业务，不做任何细分（保守保留）。 */
  const BUSINESS_CONTAINER_TYPES = new Set(['INSTANCE', 'COMPONENT', 'COMPONENT_SET'])
  /**
   * 🔴 装饰形状类型（2026-10-26 · ab7bb76c P0 治本）：
   *   纯几何图形，自身不承载业务语义。**命名判据对它们一律豁免** ——
   *   `VECTOR "icon-关闭"` 是面板外壳的关闭按钮，不是业务控件；此前它命中
   *   `BUSINESS_NAME_RE` 的 `icon` 分支，把「装饰图标 + 单标题文本」的纯
   *   标题栏判成业务 header ⇒ 逃过 `stripChromeOnly` ⇒ 顶掉 componentName 成双标题。
   */
  const DECORATIVE_SHAPE_TYPES = new Set([
    'VECTOR',
    'RECTANGLE',
    'ELLIPSE',
    'LINE',
    'STAR',
    'POLYGON',
    'BOOLEAN_OPERATION',
    'SLICE',
  ])
  const BUSINESS_NAME_RE = /tab|stat|button|switch|select|input|list|grid|card|icon|指标|切换|统计|按钮|导航|菜单|下拉|搜索|筛?选/i
  /**
   * 纯装饰容器判定（FRAME 细分，2026-10-26 · ab7bb76c P0 治本）：
   *   子树内 **无非空文案节点** ∧ **无组件实例** ∧ **无交互语义命名的非形状节点**
   *   ⇒ 该 FRAME 只是装饰图形的打包层（如 `标题img` / `标题-线` / 菱形图标），
   *   不构成业务内容，应穿透而不是直接判 business。
   *
   *   此前 `FRAME` 被一刀切列入业务容器 ⇒ 任何标题栏只要包了一层装饰 FRAME
   *   就永远判 business（807:3 的真实漏网机制）。
   *   判据完全类型驱动（除命名语义那一支），与设计稿命名无关。
   */
  const isDecorativeFrame = (n) => {
    const stack = [...(n.children || [])]
    while (stack.length > 0) {
      const c = stack.pop()
      if (!c || typeof c !== 'object') continue
      const t = String(c.type || '').toUpperCase()
      if (t === 'TEXT') return false
      if (BUSINESS_CONTAINER_TYPES.has(t)) return false
      // 形状节点的名字是图层名（icon-关闭 / Rectangle 22），不参与业务判定
      if (!DECORATIVE_SHAPE_TYPES.has(t) && BUSINESS_NAME_RE.test(String(c.name || ''))) {
        return false
      }
      for (const k of c.children || []) stack.push(k)
    }
    return true
  }
  const walk = (n) => {
    if (!n || typeof n !== 'object' || business) return
    const t = String(n.type || '').toUpperCase()
    const name = String(n.name || '')
    // 业务容器类型（实例/组件定义）→ 有业务内容，立即终止
    if (BUSINESS_CONTAINER_TYPES.has(t)) {
      business = true
      return
    }
    // FRAME 细分：装饰打包层穿透，其余（含文案/实例/交互命名）判业务
    if (t === 'FRAME') {
      if (!isDecorativeFrame(n) || BUSINESS_NAME_RE.test(name)) {
        business = true
        return
      }
      for (const c of n.children || []) walk(c)
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
    // 交互/业务语义命名（GROUP 等包裹层下）→ 有业务内容。
    // 🔴 装饰形状（裸 VECTOR/RECTANGLE/…）豁免：图层名不是业务语义。
    if (!DECORATIVE_SHAPE_TYPES.has(t) && BUSINESS_NAME_RE.test(name)) {
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

/**
 * 🛡️ 2026-09-30 治本（评审 §8.4 步骤 3 · Bug4-①）：`sections[].layout` 改为**只认 A 类布局事实**。
 *
 * 旧口径（B 类几何近似）`xSpread > ySpread` 被「子元素宽度差 / 水平偏移」污染
 * （实锤 `598d88fc` 的 `2:3683`：数值文本宽 77 vs 标题宽 128、右移 51px ⇒ xSpread=51 > ySpread=24
 * ⇒ 误判 horizontal，真值是垂直堆叠），全语料 **A/B 打架 7443/21981 = 33.9%**。
 *
 * 现改为查 A 类单一事实源 `figma-node-layout-facts#buildNodeLayoutFacts` 的结果：
 *   - 该模块自述是「容器级布局方向的**单一事实源**，禁止下游再加 grid 对冲层」，其内部已含
 *     网格优先（`detectGridColumns`）、背景层剔除、side-by-side 比例、模糊默认 row、单子节点 column；
 *   - ⚠️ 依赖方向：`figma-node-layout-facts` → `section-tree`（用 `areBoxesSideBySide`），
 *     反向 import 会**成环** ⇒ **由调用方算好传入**（唯一调用方 = `subcomponent-planner#plan`）。
 *
 * @param {Object} figmaNodeData figma-node-data.json 内容（{ document } 或直接是节点树）
 * @param {Record<string,Object>|null} [layoutFacts] A 类布局事实（`buildNodeLayoutFacts` 的结果）。
 *        缺省 null ⇒ 所有 `layout` 为 null（**无事实则显式化，不臆造默认值**）。
 * @returns {{sections:Array, backgrounds:Array, rootName:string, rootId:string}|null}
 */
/**
 * 🛡️ 孤儿文本子节点收集（2026-10-15 · 91544b38 footer 实锤；2026-10-20 全位化 · 5ef650ff 实锤）。
 *
 * 收「父容器直接子级中、未被任何已提升兄弟 sourceNodeIds 覆盖的裸 TEXT」。
 *
 * 全位化背景（5ef650ff 合作厂商弹窗）：旧判据只收「位于所有兄弟之下」的尾部孤儿
 *   （`box.y >= maxBottom-1`），导致头部统计卡的数字/标签（38:3262/3263「合作厂商/33」）
 *   与组标题（38:3139「战略合作厂商」等容器直接子级裸 TEXT）整批丢失。
 *
 * 二路分流（几何判据，命名无关）：
 *   ① **吸收**：孤儿与某已提升兄弟几何重叠（重叠面积 >50% 文本自身面积）⇒ 它视觉上
 *      属于该兄弟（卡在图标右侧的数字/标签、面板内的标题行）⇒ 并入该兄弟的
 *      sourceNodeIds/children（不改兄弟 bbox/布局），绝不新建段 ⇒ 零双渲风险；
 *   ② **独立段**：不重叠任何兄弟 ⇒ 真·头/中/尾部孤儿 ⇒ 仍走原「补回独立段」逻辑
 *      （footer 行为不变；位置由调用处按 y 排序归位）。
 *
 * @param {object} parentNode Figma 父容器节点
 * @param {Array<object>} promotedSections 已提升为 section 的兄弟（含 sourceNodeIds）
 * @returns {{ absorb: Array<{ section: object, texts: Array<object> }>, standalone: Array<object> }}
 */
function collectOrphanTextKids(parentNode, promotedSections) {
  const empty = { absorb: [], standalone: [] }
  if (!parentNode || typeof parentNode !== 'object') return empty
  if (!Array.isArray(promotedSections) || promotedSections.length === 0) return empty

  const covered = new Set()
  const promotedIds = new Set()
  for (const s of promotedSections) {
    if (!s || typeof s !== 'object') continue
    if (s.id != null) promotedIds.add(String(s.id))
    for (const id of Array.isArray(s.sourceNodeIds) ? s.sourceNodeIds : []) {
      if (id != null) covered.add(String(id))
    }
  }

  const overlapRatio = (a, b) => {
    if (!a || !b) return 0
    const ox = Math.min(a.x + (a.width || 0), b.x + (b.width || 0)) - Math.max(a.x, b.x)
    const oy = Math.min(a.y + (a.height || 0), b.y + (b.height || 0)) - Math.max(a.y, b.y)
    if (ox <= 0 || oy <= 0) return 0
    const area = (a.width || 0) * (a.height || 0)
    return area > 0 ? (ox * oy) / area : 0
  }

  const absorbMap = new Map() // section → texts[]
  const standalone = []
  const kids = (parentNode.children || []).filter((c) => c && typeof c === 'object')
  for (const k of kids) {
    if (String(k.type || '').toUpperCase() !== 'TEXT') continue
    const id = String(k.id || '')
    if (!id || promotedIds.has(id) || covered.has(id)) continue
    if (!String(k.characters || '').trim()) continue
    const box = k.absoluteBoundingBox
    if (!box || !Number.isFinite(box.y)) continue
    // ① 几何重叠 ⇒ 吸收进所属兄弟（取重叠最大者）
    let best = null
    let bestRatio = 0.5 // 阈值：>50% 文本面积落在兄弟内
    for (const s of promotedSections) {
      const r = overlapRatio(box, s?.absoluteBoundingBox)
      if (r > bestRatio) { best = s; bestRatio = r }
    }
    if (best) {
      if (!absorbMap.has(best)) absorbMap.set(best, [])
      absorbMap.get(best).push(k)
    } else {
      standalone.push(k)
    }
  }
  standalone.sort((a, b) => (a.absoluteBoundingBox?.y || 0) - (b.absoluteBoundingBox?.y || 0))
  return {
    absorb: [...absorbMap.entries()].map(([section, texts]) => ({ section, texts })),
    standalone,
  }
}

export function deriveSectionsFromFigmaTree(figmaNodeData, layoutFacts = null) {
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
    
    // 有子节点的容器优先提升为 section（已通过尺寸过滤）
    const hasChildren = Array.isArray(node.children) && node.children.length > 0

    // 🛡️ 文本条豁免（2026-09-29 · mc-max-1790650861294-f57e0d3e 实锤 · 根源判据）：
    //   3% 相对面积阈值本意是过滤**装饰性小元素**（徽章 / 图标组 / 色块）—— 其共同特征是
    //   **不承载可读文本**。而同样面积很小的「图表小标题」（本例 2:7625 = 118x21 占父容器
    //   1.05%、2:7794 = 62x21 占 0.55%）是**内容**，被误当装饰过滤 ⇒ 该节点从未进入
    //   section 计划 ⇒ 产物永远没有图表小标题（HANDOFF C1「标题已移出 @echarts 仍缺失」
    //   的真因即在此，与 @echarts 无关）。
    //
    //   判据（纯几何 + 内容，命名无关，且**不含任何与设计稿耦合的绝对尺寸**）：
    //   ① 直接子中存在「成词文本」= TEXT 且 characters 去空白后长度 ≥ 2
    //      （单字符/单数字多为徽章角标，如全语料里 14x14 的 `num`「6」）；
    //   ② 该文本宽度 ≥ 容器宽度的 50%（文本构成容器宽度的主体 ⇒ 容器是为文本而存在的条）。
    //
    //   ⚠️ 为什么不用绝对尺寸区间：首版曾写 `height ∈ [8,32] && width ≥ 40`，虽在本语料
    //      零误伤，但它与具体设计稿的字号/行高耦合 —— 换一份设计稿（标题条 40px 高）会
    //      **同类缺陷复发**，属补丁而非根源。故改为上述相对判据。
    //   全语料审计（最新 40 个 figma 样本，733 个被 3% 挡住的容器）：
    //      旧绝对尺寸判据命中 30、本源判据命中 30，**逐条一致**（仅新命中 0、仅旧命中 0）。
    const isTextBar = (() => {
      if (!hasChildren) return false
      const textKids = node.children.filter(
        (c) => String(c?.type || '').toUpperCase() === 'TEXT' && c.absoluteBoundingBox,
      )
      const readable = textKids.filter((c) => String(c.characters || '').trim().length >= 2)
      if (readable.length === 0) return false
      const widest = readable.reduce((m, c) => Math.max(m, c.absoluteBoundingBox.width || 0), 0)
      return widest >= nodeBox.width * 0.5
    })()

    // 🛡️ P0 修复：相对尺寸阈值（< 父节点 3% 的节点不提升，避免装饰性小元素）
    //   ⚠️ 文本条豁免见上：承载可读文本的窄条（标题/图例）面积占比天然极小，不受该阈值约束。
    if (parentBox && parentBox.width && parentBox.height) {
      const parentArea = parentBox.width * parentBox.height
      if (parentArea > 0 && nodeArea / parentArea < 0.03 && !isTextBar) return false
    }
    
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
      const leafKids = sortChildrenForReadingOrder(
        (parentNode.children || []).filter((c) => c && typeof c === 'object'),
      )
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
        ? { sections: sortChildrenForReadingOrder(childKids).map((c) => mapChildNode(c)), hasNested: false }
        : deriveNestedSections(child, depth + 1)
      
      // 🛡️ 2026-09-30 P0-1：容器才下发 gridColumns（叶子暂不下发；理由见 deriveChildGridColumns 注释——
      //   不是「会触发 LAYOUT-001 误 BLOCK」，那个门禁今天压根不可达，而是「手写路径未撤 + 门禁未换证据源」）
      const childGridColumns = sub.hasNested ? deriveChildGridColumns(child, layoutFacts) : null

      const nestedSection = {
        id,
        name: cleanName || name,
        ...(isHeader ? { type: 'header' } : isStats ? { type: 'stats' } : hasEcharts ? { type: 'chart' } : {}),
        figmaNodeId: id,
        // 🛡️ P1 修复（2026-09-17）：sourceNodeIds 收集子树所有节点 id，供资源挂载系统匹配 owner
        sourceNodeIds: collectSubtreeNodeIds(child),
        ...(box ? { absoluteBoundingBox: box } : {}),
        layout: deriveChildLayout(child, layoutFacts),
        ...(childGridColumns != null ? { gridColumns: childGridColumns } : {}),
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
      return { sections: sortChildrenForReadingOrder(directKids).map((c) => mapChildNode(c)), hasNested: false }
    }

    // 阅读序（y → x，同 mapChildNode 口径：行内从左到右、跨行从上到下）
    nestedSections.sort(compareReadingOrder)

    // 🛡️ 2026-10-20（#128 ⑦ · 84af4f8f 实锤）：横向并列兄弟检出。
    //   病灶：本函数恒按 y 排序兄弟 ⇒ 隐含「兄弟=纵向堆叠」假设。但设计稿常见
    //   「左图右文」头部（img 98×98 的 y 区间完整覆盖标题行+徽章行，x 不重叠）——
    //   E1 拆成纵向兄弟 ⇒ 产物 header 变成「图上、标题下」两行，布局还原失败。
    //   判据（纯几何，命名无关）：两兄弟 y 区间重叠 > 50%（以较矮者为基准）
    //   且 x 区间分离（一方右缘 ≤ 另一方左缘 +2px 容差）⇒ 横向并列对。
    //   动作：互挂 rowPeerIds 标记（**不改树结构**——结构合并牵连 planner/生成全链，
    //   标记 + 真值下发 + 产物告警是窄条件治本第一步）。
    for (let i = 0; i < nestedSections.length; i++) {
      const a = nestedSections[i].absoluteBoundingBox
      if (!a || !a.height) continue
      for (let j = i + 1; j < nestedSections.length; j++) {
        const b = nestedSections[j].absoluteBoundingBox
        if (!b || !b.height) continue
        const overlapY =
          Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
        if (overlapY <= 0) continue
        if (overlapY / Math.min(a.height, b.height) <= 0.5) continue
        const aRight = a.x + (a.width || 0)
        const bRight = b.x + (b.width || 0)
        const xSeparated = aRight <= b.x + 2 || bRight <= a.x + 2
        if (!xSeparated) continue
        const idA = String(nestedSections[i].id || '')
        const idB = String(nestedSections[j].id || '')
        if (!idA || !idB) continue
        if (!nestedSections[i].rowPeerIds) nestedSections[i].rowPeerIds = []
        if (!nestedSections[j].rowPeerIds) nestedSections[j].rowPeerIds = []
        if (!nestedSections[i].rowPeerIds.includes(idB)) nestedSections[i].rowPeerIds.push(idB)
        if (!nestedSections[j].rowPeerIds.includes(idA)) nestedSections[j].rowPeerIds.push(idA)
      }
    }

    // 🛡️ 孤儿文本段补回（2026-10-15 · c-aiot-dpjh-bsjd-91544b38 footer 实锤；
    //   2026-10-20 全位化 · 5ef650ff 头部统计卡文案/组标题丢失实锤）
    //   病灶：E1 替代 vision 后，容器**直接子级裸 TEXT** 永远进不了 section 树——
    //   `shouldPromoteToSection` 只提升容器类型，裸 TEXT 恒被跳过 ⇒ 整段文案随 vision
    //   段被替换而消失。旧判据只补尾部 ⇒ 头部/中段孤儿（统计卡数字、面板标题）照丢。
    //   判据（纯几何 + 内容，命名无关）：
    //     ① 未被任何已提升兄弟的 sourceNodeIds 覆盖 ⇒ 真孤儿（防与列表轨重复渲染）；
    //     ② TEXT 且 characters 非空 ⇒ 承载文案真值（装饰 VECTOR/RECTANGLE/滚动条不补）；
    //     ③ 几何重叠某兄弟（>50% 文本面积）⇒ 吸收进该兄弟（不新建段，零双渲）；
    //        否则 ⇒ 独立补回段（原 footer 逻辑，y 排序归位，头/中/尾皆可）。
    const orphanTextKids = collectOrphanTextKids(parentNode, nestedSections)
    // ③-a 吸收轨：并入所属兄弟（sourceNodeIds + children），兄弟 bbox/布局不动
    for (const { section, texts } of orphanTextKids.absorb) {
      if (!Array.isArray(section.sourceNodeIds)) section.sourceNodeIds = []
      if (!Array.isArray(section.children)) section.children = []
      for (const t of texts) {
        const tid = String(t.id || '')
        if (tid && !section.sourceNodeIds.includes(tid)) section.sourceNodeIds.push(tid)
        section.children.push(mapChildNode(t))
      }
      // 🛡️ P2（2026-10-21 · 07ae49a2 实锤）：吸收是 **push 追加**，追加进来的裸 TEXT
      //   （卡内 `33` / `合作厂商`）必然排到末尾 ⇒ 子项顺序 = 「已提升兄弟的 z-order + 追加的
      //   孤儿文本」，与真值阅读序无关。下游据此写模板 ⇒ 「33 在上、合作厂商在下」。
      //   治本：吸收完统一按阅读序（y → x）重排 —— 与 mapChildNode / nestedSections 同一比较器，
      //   不新增判据、不改任何兄弟本身。
      section.children = sortChildrenForReadingOrder(section.children)
    }
    // ③-b 独立段轨（头/中/尾真孤儿）
    //   全位化后 standalone 可能同时含头部与尾部孤儿（5ef650ff 实测）⇒ 先按 y 带聚类：
    //   相邻文本与当前带的底边不重叠（gap>1px）⇒ 新开一带；每带独立成段。
    const orphanBands = []
    for (const t of orphanTextKids.standalone) {
      const b = t.absoluteBoundingBox
      const band = orphanBands[orphanBands.length - 1]
      const bandBottom = band ? Math.max(...band.map((x) => (x.absoluteBoundingBox?.y || 0) + (x.absoluteBoundingBox?.height || 0))) : -Infinity
      if (band && b && b.y <= bandBottom + 1) band.push(t)
      else orphanBands.push([t])
    }
    // 位置语义：全在兄弟之上 ⇒ header；全在兄弟之下 ⇒ footer；否则 text（中段）
    const sibBoxes = nestedSections.map((s) => s?.absoluteBoundingBox).filter((b) => b && Number.isFinite(b.y))
    const minSibTop = sibBoxes.length ? Math.min(...sibBoxes.map((b) => b.y || 0)) : Infinity
    const maxSibBottom = sibBoxes.length ? Math.max(...sibBoxes.map((b) => (b.y || 0) + (b.height || 0))) : -Infinity
    orphanBands.forEach((bandKids, bandIdx) => {
      const boxes = bandKids
        .map((t) => t.absoluteBoundingBox)
        .filter((b) => b && Number.isFinite(b.y))
      const mergedBox = boxes.length
        ? {
            x: Math.min(...boxes.map((b) => b.x || 0)),
            y: Math.min(...boxes.map((b) => b.y || 0)),
            width:
              Math.max(...boxes.map((b) => (b.x || 0) + (b.width || 0))) -
              Math.min(...boxes.map((b) => b.x || 0)),
            height:
              Math.max(...boxes.map((b) => (b.y || 0) + (b.height || 0))) -
              Math.min(...boxes.map((b) => b.y || 0)),
          }
        : null
      // 同行（y 极差 ≤4px）⇒ 横排；否则纵排。纯几何自判定，不猜语义。
      const sameRow = boxes.length > 1
        ? Math.max(...boxes.map((b) => b.y || 0)) - Math.min(...boxes.map((b) => b.y || 0)) <= 4
        : false
      const orphanTop = mergedBox ? mergedBox.y : 0
      const orphanBottom = mergedBox ? mergedBox.y + mergedBox.height : 0
      const posType = orphanBottom <= minSibTop + 1 ? 'header'
        : orphanTop >= maxSibBottom - 1 ? 'footer'
        : 'text'
      nestedSections.push({
        // 单带保持旧 id（-tail-text，footer 兼容）；多带按 y 序编号
        id: orphanBands.length === 1
          ? `${String(parentNode.id || 'section')}-tail-text`
          : `${String(parentNode.id || 'section')}-orphan-text-${bandIdx}`,
        name: bandKids
          .map((t) => String(t.characters || t.name || '').trim())
          .filter(Boolean)
          .slice(0, 3)
          .join(' / ')
          .slice(0, 40),
        type: posType,
        // figmaNodeId 取首行文本节点：供 planner enrich 按 id 匹配（即便无 vision 对应段也不误配）
        figmaNodeId: String(bandKids[0]?.id || ''),
        sourceNodeIds: bandKids.map((t) => String(t.id || '')).filter(Boolean),
        ...(mergedBox ? { absoluteBoundingBox: mergedBox } : {}),
        layout: sameRow ? 'horizontal' : 'vertical',
        children: bandKids.map((c) => mapChildNode(c)),
        isNestedSection: depth > 0,
        // 🛡️ 孤儿标记：供下游/审计识别「推导补回段」（非 Figma 容器，纯文本行）
        orphanTailText: true,
        styles: {
          flexGrow: 0,
          flexShrink: 1,
          flexBasis: 0,
          ...(mergedBox && mergedBox.height ? { figmaHeightPx: mergedBox.height } : {}),
        },
      })
      nestedSections.sort(compareReadingOrder)
    })

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
      ? { sections: sortChildrenForReadingOrder(directKids).map((c) => mapChildNode(c)), hasNested: false }
      : deriveNestedSections(child, 1)
    
    // 🛡️ 2026-09-30 P0-1：容器才下发 gridColumns（叶子暂不下发；理由见 deriveChildGridColumns 注释——
    //   不是「会触发 LAYOUT-001 误 BLOCK」，那个门禁今天压根不可达，而是「手写路径未撤 + 门禁未换证据源」）
    const childGridColumns = sub.hasNested ? deriveChildGridColumns(child, layoutFacts) : null

    sections.push({
      id,
      name: cleanName || name,
      ...(isHeader ? { type: 'header' } : hasEcharts ? { type: 'chart' } : {}),
      figmaNodeId: id,
      // 🛡️ P1 修复（2026-09-17）：sourceNodeIds 收集子树所有节点 id，供资源挂载系统匹配 owner
      sourceNodeIds: collectSubtreeNodeIds(child),
      // 🛡️ 关键：absoluteBoundingBox 确定性透传 —— extractLayoutMetadata 的 height 事实源
      ...(box ? { absoluteBoundingBox: box } : {}),
      layout: deriveChildLayout(child, layoutFacts),
      ...(childGridColumns != null ? { gridColumns: childGridColumns } : {}),
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

  // 阅读序（y → x；与子级同一口径）
  sections.sort(compareReadingOrder)

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
  const CONTAINER_TYPES = new Set([
    'FRAME',
    'GROUP',
    'INSTANCE',
    'COMPONENT',
    'COMPONENT_SET',
  ])
  // 🛡️ 治本（2026-09-29 · mc-max-1790693732608-b6e018d6 实锤）：
  //   旧口径「深度优先第一个有 children 的 FRAME」在「GROUP 业务根 + FRAME header 子」
  //   树形下会选中头部条当根 ⇒ E1 顶层 sections 变成 header 条的内部结构
  //   （1:2079/1:2100/1:2109），后果三连：① 无 header 事实（上月/本年 tabs 成 body 叶）
  //   ⇒ 装配器 headerLeaves 空 ⇒ #header-right 不生成、头部控件全落内容区；
  //   ② slot-con 图表区整体被踢出 section 树；③ 上月/本年渲染位置错误。
  //   figma-node-data.json 的顶层即「请求的 nodeId 节点」（组件根）：
  //   doc 自身是容器且有 children ⇒ doc 就是根（FRAME / GROUP / INSTANCE 均可）。
  //   全语料 406 份重放：仅 10 份（2.5%）受选根错误影响，全部是本病灶家族
  //   （GROUP 'cp-*' 根 + FRAME 'header' 子），本口径全部选对真根，其余零漂移。
  const selfType = String(node.type || '').toUpperCase()
  if (
    CONTAINER_TYPES.has(selfType) &&
    Array.isArray(node.children) &&
    node.children.length > 0
  ) {
    return node
  }
  // doc 是包装层（DOCUMENT / CANVAS 等，非业务容器）→ 下钻：
  // 取全树「有 children 的容器节点」中 absoluteBoundingBox 面积最大者
  // （并列取深度最浅）。Figma 几何不变式（子 bbox ⊆ 父 bbox）保证面积最大的
  // 容器最接近真根；无 bbox 的退化数据按旧口径深度优先找第一个 FRAME。
  const all = []
  const collect = (n, depth) => {
    if (!n || typeof n !== 'object' || depth > 60) return
    all.push({ n, depth })
    for (const c of n.children || []) collect(c, depth + 1)
  }
  collect(node, 0)
  let best = null
  for (const { n, depth } of all) {
    const t = String(n.type || '').toUpperCase()
    if (!CONTAINER_TYPES.has(t)) continue
    if (!Array.isArray(n.children) || n.children.length === 0) continue
    const b = n.absoluteBoundingBox
    if (!b || !b.width || !b.height) continue
    const area = b.width * b.height
    if (
      !best ||
      area > best.area + 1e-6 ||
      (Math.abs(area - best.area) < 1e-6 && depth < best.depth)
    ) {
      best = { n, area, depth }
    }
  }
  if (best) return best.n

  // 旧口径兜底：无 bbox 的退化数据（测试桩 / 裁剪导出）按原深度优先找 FRAME。
  for (const c of node.children || []) {
    const r = findRootFrame(c)
    if (r) return r
  }
  return null
}

/**
 * section 布局方向（vision 的 `layout` 字段语义）—— **只认 A 类布局事实**。
 *
 * 🛡️ 2026-09-30 治本（评审 §8.4 步骤 3 · Bug4-①）：旧实现读 `node.layoutMode` 后回退
 * 「`xSpread > ySpread`」几何近似，该近似被**子元素宽度差 / 水平偏移**污染（A/B 打架
 * 7443/21981 = 33.9%，其中 6551 条 B=horizontal 而 A=vertical）⇒ **整段删除**，改为查
 * `figma-node-layout-facts#buildNodeLayoutFacts` 产出的 A 类事实（其内部已含网格聚类、
 * 背景层剔除、side-by-side 比例、模糊默认 row、单子节点 column，`layoutMode` 分支亦同源）。
 *
 * 映射：
 *   - `display:'grid'`          → `'grid'`        （**新增分支**：旧 B 类完全无 grid 概念）
 *   - `flexDirection:'row'`     → `'horizontal'`
 *   - `flexDirection:'column'`  → `'vertical'`
 *   - A 类无该节点事实          → `null`          （**取消原「无事实默认 vertical」**：
 *     落实「无事实是最坏结果」的显式化；消费方 `generation-context-assembler` 已按
 *     `layout || null` 容忍，`inline-row-assembler#isHorizontalSection` 只认严格相等 ⇒ 不受影响）
 *
 * @param {Object} node Figma 节点
 * @param {Record<string,Object>|null} layoutFacts A 类布局事实（`buildNodeLayoutFacts` 结果）
 * @returns {'horizontal'|'vertical'|'grid'|null}
 */
function deriveChildLayout(node, layoutFacts = null) {
  const id = node && node.id != null ? String(node.id) : ''
  const fact = (id && layoutFacts && layoutFacts[id]) || null
  if (!fact) return null
  if (fact.display === 'grid') return 'grid'
  if (fact.flexDirection === 'row') return 'horizontal'
  if (fact.flexDirection === 'column') return 'vertical'
  return null
}

/**
 * 🛡️ 2026-09-30 复审 P0-1：把 A 类事实里的 `gridColumns` 一起带出来（此前只取了 `display` ⇒ **列数被丢弃**）。
 *
 * 为什么要带：`buildNodeLayoutFacts` 对几何聚类出的均匀网格会给
 * `{ display:'grid', gridColumns:N }`，而 `deriveChildLayout` 只返回 `'grid'` ⇒
 * `sections[].gridColumns` 恒缺 ⇒ 下游「网格列数」事实链断在源头（离线审计：1744 个 grid section
 * 里 **1342（77%）** 今天拿不到任何列数；另有 402 个靠 planner 的二次几何聚类侥幸补回，且与 A 类**零冲突**）。
 *
 * ⚠️ 只对**容器**（`isLayoutContainerSection === true`，即 sub.hasNested）下发，**叶子仍不下发** ——
 *   但**理由已更正（2026-09-30 复审 §8.6，本节 8.5 的归因是错的）**：
 *     · 原写「叶子下发会触发 `LAYOUT-001` 误 BLOCK」。**归因错误**：`LAYOUT-001`（`validators/
 *       code-structure-validator.js:1699-1771`）读的是 **vision 的 `state.layoutStructure`**
 *       （由 `mc-component-graph-phase2.js:3840` / `mc-component-graph-vue3.js:2601` 传参），
 *       与本文件的 sections 是**两条互不相通的数据链** ⇒ 本节新增的 `gridColumns` **流不到**该门禁。
 *     · 且该门禁**今天是死代码**：守卫是 `if (options?.layoutStructure?.sections)`，而真实结构为
 *       `layoutStructure.layout.sections`（**嵌套**）⇒ 顶层 `sections` 恒 undefined，**411/411 产物不可达**、
 *       近 7 天日志 **0 留痕**（L0-B 会逐条打印 issue id，故负证据有效）。
 *   真实理由（两条，都属「等前置就绪再开」）：
 *     ① **写产物侧今天仍走手写路径**：`constraint-reinforcement.js:60-70`「内层栅格铁律」明令 LLM
 *        手写 `display:grid; grid-template-columns:repeat(N,1fr)`（自注「事实表是 section 级单层」）。
 *        叶子列数若现在就进事实注入链 ⇒ **双写**（注入 vs 手写互相覆盖，即 3b 记录过的布局错乱源）；
 *        须先删该铁律与对应 prompt 文案（复审 §8.6 方案2 之 **2c**）才谈得上开叶子。
 *     ② **该门禁是潜伏雷**：一旦有人放开守卫或改成递归遍历，叶子列数就会引爆 —— 离线全语料模拟实测
 *        **24 条 BLOCK**（子组件有 grid 误判 **15** + 仅 `common.less` 误判 **2** + 待确认 **1** +
 *        `horizontal` 分支 **6**，该分支拿整份模板做全局正则、无 section 归属）。故须先按
 *        「证据源 = **真实产物**（该 section 的宿主子组件 `.vue` + `common.less`）」改造该门禁
 *        （方案2 之 **2b**），届时容器/叶子一视同仁地开。
 *
 * @returns {number|null} 仅当 A 类事实声明 grid 且列数 ≥2 时返回列数，否则 null
 */
function deriveChildGridColumns(node, layoutFacts = null) {
  const id = node && node.id != null ? String(node.id) : ''
  const fact = (id && layoutFacts && layoutFacts[id]) || null
  if (!fact || fact.display !== 'grid') return null
  const n = Number(fact.gridColumns)
  return Number.isFinite(n) && n >= 2 ? n : null
}

/**
 * 🛡️ P2（2026-10-21 · 07ae49a2 实锤）：子节点按**阅读序**（y 优先、x 次之）排序后再映射。
 *
 * 事故形态：卡 38:3260 的真值子节点为 icon(51496) / `合作厂商` TEXT(51496) / `33` TEXT(51522)，
 * 但 Figma `children` 是 **z-order（绘制序）**，`33` 排在 `合作厂商` 之前 ⇒ E1 派生的 children
 * 顺序、prompt 里的子项清单、以及下游 LLM 写模板的顺序全部颠倒 ⇒ 产物「33 在上、合作厂商在下」。
 *
 * 判据：几何真值即阅读顺序 —— 行内（同 y）按 x 从左到右；跨行按 y 从上到下。
 *   这正是网格 row-major、横向 flex-flow、纵向 flex-flow 三者共同的自然序，故**无需**先判容器方向。
 * 缺 bbox 的节点保持相对原位置并排在末尾（稳定排序，不臆造几何）。
 */
function sortChildrenForReadingOrder(children = []) {
  return children
    .map((c, i) => ({ c, i }))
    .sort((a, b) => compareReadingOrder(a.c, b.c) || a.i - b.i)
    .map(({ c }) => c)
}

/**
 * 阅读序比较器（y → x）：section-tree 内**唯一**几何排序口径。
 * 供 E1 的 item 序（mapChildNode）与 section 序（deriveNestedSections）共用，避免两处各写一份。
 * 缺 bbox 的一侧排末尾（不臆造几何）。
 */
export function compareReadingOrder(a, b) {
  const ab = a?.absoluteBoundingBox || a?.figmaBox || {}
  const bb = b?.absoluteBoundingBox || b?.figmaBox || {}
  const ay = Number.isFinite(ab.y) ? Math.round(ab.y) : Number.MAX_SAFE_INTEGER
  const by = Number.isFinite(bb.y) ? Math.round(bb.y) : Number.MAX_SAFE_INTEGER
  if (ay !== by) return ay - by
  const ax = Number.isFinite(ab.x) ? Math.round(ab.x) : Number.MAX_SAFE_INTEGER
  const bx = Number.isFinite(bb.x) ? Math.round(bb.x) : Number.MAX_SAFE_INTEGER
  return ax - bx
}

/** 子节点 → vision body.children 格式（递归保留嵌套结构，供下游 deriveSectionType/countElements 识别 tab/list/chart）。 */
function mapChildNode(node, depth = 0) {
  if (!node || typeof node !== 'object') return null
  if (depth > 6) return null // 防御深度，避免超深节点树拖慢
  const box = node.absoluteBoundingBox || null
  const kids = sortChildrenForReadingOrder(node.children || [])
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

/**
 * 🛡️ 样式真值条目的「**文本优先**」裁剪（2026-10-19 治本 · mc-max-1792373861220-5160a2ec 实锤）
 *
 * 事故：单 section 样式条目收集是**深度优先 + 单一配额闸门**（`itemCount >= maxItemsPerSection`），
 *   header 段 12 条配额被 `标题img / 标题-线 / Rectangle ×7 / Group 11` 等**装饰图元**耗光 ⇒
 *   排在后面的 TEXT 节点（`48:5902`「全国」）**静默丢失** ⇒ 产物 HeaderSection.vue 零文本节点，
 *   「全国」选择器整块消失（实测：配额 12 ⇒ 无「全国」；配额 40 ⇒ 有「全国」）。
 *
 * 危害面：这是**配额策略缺陷，不是某个组件/某个文案的特例** —— 任何可见节点数超过配额的
 *   section 都会丢尾部元素，而**文本常排在嵌套较深处或尾部**，且文本只有本通道下发
 *   （图片/资源另有 injectResourceImports 通道，被砍也能活）⇒ 文本是最容易被静默吃掉的一等公民。
 *
 * 治本（零硬编码、无组件/节点名特例）：收集与裁剪解耦——
 *   ① 收集阶段用 **更大的** `collectCap`（仅防爆炸，不做语义取舍）；
 *   ② 输出阶段按 **`isText` 标记**取舍：**TEXT 条目全保留**，剩余配额才给装饰条目；
 *   ③ 最终仍按 **Figma 原始序**输出（顺序本身就是真值，不得重排）。
 *
 * @param {string[]} lines 样式条目（已按 Figma 序）
 * @param {boolean[]} flags 与 lines 一一对应：true = 该条目是 TEXT 文本真值
 * @param {number} quota 输出配额（maxItemsPerSection）
 * @returns {{lines: string[], droppedText: number, droppedDeco: number}}
 */
export function pickTextPriorityLines(lines = [], flags = [], quota = 0) {
  const arr = Array.isArray(lines) ? lines : []
  const fl = Array.isArray(flags) ? flags : []
  const n = Math.min(arr.length, fl.length)
  if (!Number.isFinite(quota) || quota <= 0) {
    return { lines: arr.slice(0, n), droppedText: 0, droppedDeco: 0 }
  }
  if (n <= quota) return { lines: arr.slice(0, n), droppedText: 0, droppedDeco: 0 }

  const idx = Array.from({ length: n }, (_, i) => i)
  const textIdx = idx.filter((i) => fl[i] === true)
  const decoIdx = idx.filter((i) => fl[i] !== true)

  const keep = new Set(textIdx.slice(0, quota))
  const room = Math.max(quota - keep.size, 0)
  const decoKept = decoIdx.slice(0, room)
  for (const i of decoKept) keep.add(i)

  const textKept = Math.min(textIdx.length, quota)
  return {
    // ⚠️ 仍按原始序号输出：顺序真值不得重排
    lines: idx.filter((i) => keep.has(i)).map((i) => arr[i]),
    droppedText: textIdx.length - textKept,
    droppedDeco: decoIdx.length - decoKept.length,
  }
}

export function buildSectionStyleFacts(treeSections, figmaNodeData, opts = {}) {
  if (!Array.isArray(treeSections) || treeSections.length === 0) return ''
  if (!figmaNodeData || typeof figmaNodeData !== 'object') return ''

  const maxLeaves = opts.maxLeaves ?? 12
  const maxItemsPerSection = opts.maxItemsPerSection ?? 12
  // 布局与顺序轨独立配额（实测单 section 最多 5 条：横向顺序 ≤3 + 文本块纵向 + 重复单元/嵌套布局）
  const maxLayoutPerSection = opts.maxLayoutPerSection ?? 6
  const maxDepth = opts.maxDepth ?? 4
  // 🛡️ 2026-10-19 治本（5160a2ec「全国」漏收实锤）：**收集上限 ≫ 输出配额**。
  //   收集阶段只做「防爆炸」取舍（深/超大子树），**不做语义取舍**；语义取舍（文本优先）
  //   统一交给输出阶段的 `pickTextPriorityLines`，避免配额被装饰图元耗光后静默吃掉文本。
  const collectCap = opts.collectCap ?? Math.max(maxItemsPerSection * 4, 48)

  // 建 Figma 节点索引（id → rawNode）
  const root = figmaNodeData?.document ?? figmaNodeData
  const index = indexFigmaNodes(root)

  // 🛡️ 2026-10-23（刀 53 外观扩维）：`rgbaToCss` / `fillsToCss` / `strokesToCss` /
  //   `gradAngleDeg` 四个局部箭头函数**无任何闭包捕获**（只用参数），已提升为模块级
  //   导出（见文件尾部 `cssRgba` / `fillsToCss` / `strokesToCss` / `gradientAngleDeg`），
  //   供 `folded-grid-section-takeover.js` 复用 —— 禁止在刀具里造第二份 fills/strokes
  //   解析实现（副本 ≥2 份 = 事故温床：真值解析口径必须单一）。本处行为逐字不变。

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

  // 🛡️ 2026-09-29 治本（mc-max-1790669176199-94b3bc69 实锤）：**祖先「布局容器」的布局轨**
  //
  //   事故形态：planner 把「重复单元容器」标成 `layoutSource='container-rebuild'`
  //   （`isLayoutContainerSection` 为真，语义是「仅空间包裹、不单独生成 .vue，子区块在父模板内组装」），
  //   而 `walkLeaves` 对容器是**穿透跳过** —— 于是真正的容器（真机 `2:8023` = `Group 2136639043`，
  //   GROUP 378×74，3 个同尺寸子项 136:127/128/129）**永远不是 `startRec`**
  //   ⇒ `describeRepeatedItemLayout(2:8023)` 从不执行 ⇒ **零「重复单元×N」事实**。
  //
  //   穿透后落地的 leaf 是**重复项原型**（`136:127-list`，`itemCount=3 / renderHint='v-for'`），
  //   而它的 `nodes[0]` = `136:127`（单张卡「3」，141×74）—— 在**单张卡**身上
  //   `describeRepeatedItemLayout` 必然 null（一张卡内部是 bg/icon/label/value，并不同构），
  //   `describeContainerLayout` 也被「每列 ≥2 项」闸门排除 ⇒ **两条路径双双落空 = 零布局事实**
  //   ⇒ LLM 只能按 DOM 序把 icon/label/value 竖排堆叠（产物 `.list-item{flex-direction:column}`，
  //   而 Figma 真值是 `row`：icon 左 + 文字列右）。
  //
  //   治本：为该 leaf 的**每个祖先容器 section 的根 figma 节点**追加一次布局轨扫描（同一
  //   `describeRepeatedItemLayout` / `describeContainerLayout` 口径，不产生第二套事实、不新增判据）。
  //   顺序「由内到外」：最近的容器（重复单元宿主）先于外层包裹容器。
  //   纯几何、无命名特例、配额仍由 `maxLayoutPerSection` 统一约束。
  const containerAncestors = new Map() // leafSectionId → [祖先容器 section, ...]（由内到外）
  const walkTreeForContainers = (secs, chain) => {
    for (const s of secs || []) {
      if (!s) continue
      if (chain.length > 0) {
        const key = String(s.id || '')
        if (key && !containerAncestors.has(key)) containerAncestors.set(key, chain.slice())
      }
      const nextChain = isLayoutContainerSection(s) ? [s, ...chain] : chain
      if (Array.isArray(s.children) && s.children.length > 0) {
        walkTreeForContainers(s.children, nextChain)
      }
    }
  }
  walkTreeForContainers(treeSections, [])

  const lines = []
  let leafUsed = 0
  let layoutBannerShown = false
  // ⑦-b：容器穿透下放的「横向并列」真值行去重登记（容器 id 维度，每容器只发一次）
  const emittedRowPeerContainers = new Set()
  // ⑧：面板底真值去重登记（节点 id 维度，每面板只发一次）
  const emittedPanelBases = new Set()
  // 🛡️ 2026-10-20 ⑧（5ef650ff 实锤）：**容器装饰矩形（面板底）真值下发**。
  //   病灶：分组面板（38:3137/3162/3206）自身 fills=[]，底色/圆角/描边都挂在
  //   与容器同尺寸的首个子矩形（38:3138 等，#e2d084@0.20 r=12）上；旧实现不下发
  //   这类「面板底」事实 ⇒ 产物三个面板零 background/零圆角/零描边，整组消失。
  //   判据（纯几何，命名无关）：节点自身无填充 ∧ 首个子节点是 RECTANGLE/VECTOR
  //   ∧ 子框与节点框同尺寸（差 ≤2px）∧ 子有可见填充或描边 ⇒ 它是面板底色层。
  //   （#133 起提到 leaf 循环外：全树兜底轨道复用同一函数，不产生第二套判据。）
  const describePanelBase = (rawNode) => {
    if (!rawNode || typeof rawNode !== 'object') return null
    if (Array.isArray(rawNode.fills) && rawNode.fills.some((f) => f && f.visible !== false)) return null
    const nb = rawNode.absoluteBoundingBox
    const first = (rawNode.children || [])[0]
    if (!first || !nb) return null
    const t = String(first.type || '').toUpperCase()
    if (t !== 'RECTANGLE' && t !== 'VECTOR') return null
    const cb = first.absoluteBoundingBox
    if (!cb) return null
    if (Math.abs((cb.x || 0) - (nb.x || 0)) > 2 || Math.abs((cb.y || 0) - (nb.y || 0)) > 2) return null
    if (Math.abs((cb.width || 0) - (nb.width || 0)) > 2 || Math.abs((cb.height || 0) - (nb.height || 0)) > 2) return null
    const bg = fillsToCss(first.fills, first.opacity)
    const border = strokesToCss(first.strokes)
    // 🛡️ 2026-10-20 #133（477e185d 实锤）：面板底矩形常挂 INNER_SHADOW（内发光，
    //   金 #ffc800/绿 #35be52/青 #19b5ba blur=16）。旧实现只下发 bg/radius/border ⇒
    //   LLM 无从得知发光真值 ⇒ 产物零 box-shadow。合并进本真值行（纯增量不占新配额）。
    //   2026-10-21 刀 42：实现收敛到 `figma-effects.js`（自愈链读的是同一份）。
    const shadow = effectsToBoxShadow(first.effects) || effectsToBoxShadow(rawNode.effects)
    if (!bg && !border && !shadow) return null
    const radius = Number(first.cornerRadius) || 0
    const parts = []
    if (bg) parts.push(`background: ${bg}`)
    if (radius > 0) parts.push(`border-radius: ${radius}px`)
    if (border) parts.push(`border: 1px solid ${border}`)
    if (shadow) parts.push(`box-shadow: ${shadow}`)
    return (
      `  - 面板底(几何)：本区块底层有与容器同尺寸的底色矩形 ⇒ 本区块容器必须实现 ` +
      parts.join('、') +
      `（这是分组面板的底色/圆角/发光，**禁止省略**——省略后面板整组消失）`
    )
  }

  // 🛡️ #134（477e185d 实锤）：**行式网格真值下发**。
  //   病灶：设计稿的「N 列网格」常实现为「每行一个 HORIZONTAL frame + 行纵向堆叠」
  //   （38:3206 青面板：4 个行 frame，各含 2-4 个 126×30 chips，gap=20）。此结构下
  //   `describeContainerLayout` 不命中（各项不共面：行 frame 是子容器，cols=1）；
  //   横向顺序事实只在 DOM 序≠视觉序时输出（chips 本就有序）⇒ **方向零告知** ⇒
  //   LLM 把 chips 竖排成单列（产物 ContentSection7/8 单列病灶）。判据（纯几何，
  //   命名无关）：容器 content 子项中 ≥2 个「行 frame」（子容器内部 ≥2 子项两两
  //   side-by-side、等高 ±4px）⇒ 行式网格；列数取众数，行宽多数派一致防误报。
  const describeRowGridLayout = (parentNode) => {
    const pb = parentNode?.absoluteBoundingBox
    if (!pb || !pb.width || !pb.height) return null
    const pArea = pb.width * pb.height
    const content = (parentNode.children || []).filter((c) => {
      const b = c && c.absoluteBoundingBox
      if (!b) return false
      if ((b.width * b.height) / pArea >= 0.9) return false // 整块背景层
      if (Math.min(b.width || 0, b.height || 0) <= 8) return false
      return true
    })
    const rowFrameInfo = (c) => {
      const t = String(c.type || '').toUpperCase()
      if (!['FRAME', 'GROUP', 'INSTANCE', 'COMPONENT'].includes(t)) return null
      const cb = c.absoluteBoundingBox
      if (!cb || !cb.width || !cb.height) return null
      // 🛡️ 行宽闸门（477e185d 复放实锤）：真「行」至少占父容器一半宽（38:3211=564/604=93%）；
      //   chip 单元格内部 [label,value] 对只占 126/564=22% ⇒ 不算行（否则整片误报「2 列×N 行」）
      if (cb.width < pb.width * 0.5) return null
      const kids = (c.children || []).filter((k) => {
        const b = k && k.absoluteBoundingBox
        if (!b) return false
        if ((b.width * b.height) / (cb.width * cb.height) >= 0.9) return false
        if (Math.min(b.width || 0, b.height || 0) <= 8) return false
        return true
      })
      if (kids.length < 2) return null
      for (let i = 0; i < kids.length; i++) {
        for (let j = i + 1; j < kids.length; j++) {
          if (!areBoxesSideBySide(kids[i], kids[j])) return null
        }
      }
      const h0 = kids[0].absoluteBoundingBox.height || 0
      const eqH = kids.every((k) => Math.abs((k.absoluteBoundingBox.height || 0) - h0) <= 4)
      return eqH ? { count: kids.length, width: cb.width } : null
    }
    const rows = content.map(rowFrameInfo).filter(Boolean)
    // 🛡️ rows≥1（金面板 38:3137 单行 4 chips 也需方向真值；闸门已含 side-by-side+等高+
    //   行宽≥50% 父宽，单行误报风险可控）
    if (rows.length < 1) return null
    // 列数众数（各行等宽同构；末行可不满）
    const countFreq = new Map()
    for (const r of rows) countFreq.set(r.count, (countFreq.get(r.count) || 0) + 1)
    const perRow = [...countFreq.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0]
    if (perRow < 2) return null
    // 行宽一致性闸门：多数派行宽 20px 桶占比 ≥50%（防「纵排杂容器」误报成网格）
    const wFreq = new Map()
    for (const r of rows) {
      const key = Math.round(r.width / 20) * 20
      wFreq.set(key, (wFreq.get(key) || 0) + 1)
    }
    const domN = [...wFreq.values()].sort((a, b) => b - a)[0]
    if (domN < Math.ceil(rows.length * 0.5)) return null
    const basis = Math.floor(100 / perRow)
    return (
      `  - 行式网格(几何)：本区块是 **${perRow} 列 × ${rows.length} 行** 的网格（每行 ${perRow} 项横向并列，末行可不满）⇒ ` +
      `容器 \`display:flex; flex-direction:row; flex-wrap:wrap\`，每项 \`flex: 1 1 calc(${basis}% - 20px)\`；` +
      `或 \`display:grid; grid-template-columns: repeat(${perRow}, 1fr)\`。**禁止把同行各项竖排成单列**`
    )
  }

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
    // 🛡️ 与 secLines 一一对应的「是否 TEXT 文本真值」标记（2026-10-19 治本）：
    //   输出裁剪时凭此保住所有文本条目（见 `pickTextPriorityLines`）。
    const secLineIsText = []
    // 🛡️ 布局与顺序事实**独立轨**（2026-09-29 · 全语料 40 样本审计：布局类 122 行 / 4.6%，样式类 2505 行 / 95.4%）
    //
    //   背景：`重复单元` / `内部布局(几何 · 嵌套)` / `横向顺序(几何)` / `文本块纵向` 这四类事实原本与
    //   `bg:` `color:` `尺寸:` 同属 `secLines`，逐条同格式输出；「文本块纵向」更被 `parts.join(' | ')`
    //   拼进样式行（形如 `尺寸:131×52 | 文本块纵向(...)`）⇒ 下游 LLM 把它当**样式属性**而非**结构指令**
    //   ⇒ 实测（mc-max-1790654134322-bc91bb18）事实已下发却未被遵循：
    //      `CardGrid13.vue` 的 `con` 子序仍是 `[环形, 客车, 货车]`（环形最左）、数字卡仍是数值在上。
    //
    //   治本：布局事实走独立轨，与样式轨**分段输出** —— 样式段引导语只管样式，布局段自带结构强指令。
    //   ⚠️ 单一事实源不变：仍是同一次 collect/scan 的产出，只是**排版分流**，不产生第二份事实。
    const layoutLines = []
    let itemCount = 0

    // 🛡️ P2（2026-09-17 · e4709ad0 实锤）：sourceNodeIds 含整棵子树时，
    //   12 张同构卡会把 maxItemsPerSection 配额耗在 bg/vector 上，卡片文字色和内部布局进不了 prompt。
    //   治本：只从 section 根（figmaNodeId / id）开始采集；重复同尺寸子项只采样第一张。
    const rootId = sec.figmaNodeId ? String(sec.figmaNodeId) : String(sec.id)
    const startRec = index.get(rootId) || nodes[0]
    const startNodes = startRec ? [startRec] : nodes.slice(0, 1)

    const describeRepeatedItemLayout = (parentNode) => {
      const kids = (parentNode?.children || []).filter((c) => c && c.absoluteBoundingBox)
      // 🛡️ 2026-09-29 门槛 4 → 3（mc-max-1790667854851-5f5bce3a 实锤）：
      //   原门槛「直接子 ≥4」把**最常见的 3 项列表**整类排除 —— 真机 `2:8023`
      //   (`Group 2136639043`, 378×74) 只有 3 个同尺寸子项（危化品车/重型货车/超高车辆）
      //   ⇒ 本函数 `return null` ⇒ 没有「重复单元」事实 ⇒ LLM 按 DOM 序把 icon/label/value
      //   **竖排堆叠**，产物 `.list-item` 连 `display:flex` 都没有（截图实锤：icon 在上、
      //   文字在下、数值被裁）。
      //   而同族的 `describeContainerLayout` 也被「每列 ≥2 项」闸门排除（其注释明确写着
      //   「icon + 文字行」交给本函数）⇒ **两条路径双双落空 = 零布局事实**。
      //   放宽依据：「3 个同尺寸同结构兄弟」已是重复单元的强信号；且下方 `iconLeft` 判据
      //   基于**真实几何**（icon 落点 ≤ 容器宽 45%），几何不符时输出的是**中性指令**
      //   （「按子节点 x/y 还原」）而非强行横排 ⇒ 放开门槛的误报危害有限。
      if (kids.length < 3) return null
      const w0 = kids[0].absoluteBoundingBox.width
      const h0 = kids[0].absoluteBoundingBox.height
      // 🛡️ 2026-09-29 `similar` 判据修正（mc-max-1790667854851-5f5bce3a 实锤，与上方门槛 4→3 配套）：
      //
      //   原判据「宽高各差 <8px」是**双重绝对阈值**，把最常见的横向列表整类排除 ——
      //   横向重复单元「高度必然相同」（同一行、同一高度），但**宽度随内容长度变化是常态**
      //   （真机 `2:8023` = 危化品车51次 / 重型货车2次 / 超高车辆19次 ⇒ 宽 140/120/141，
      //    高度全为 74）。宽差 21px > 8 ⇒ similar 只剩 2 个 ⇒ `return null` ⇒ 无「重复单元」
      //   事实 ⇒ LLM 按 DOM 序把 icon/label/value 竖排堆叠。
      //   ⚠️ 实测：仅把门槛 4→3 放宽是**零效果**的（全语料「恰好 3 个同尺寸子项」的容器 = 0），
      //      因为第二道闸门把所有尺寸不等的 3 项列表全挡在门外 —— 两道判据必须同时修。
      //
      //   修正后的判据 = 「**同高**（<8px）**且宽度相近**（相对差 ≤20%，或绝对差 <8px）」：
      //   - 同高：横向同行的重复单元的必要条件（纵向堆叠的同宽异高项不会被误纳）。
      //   - 宽度相近（相对差）：区分「重复单元」与「标题+按钮」这类**同高同行但不同构**的组合 ——
      //     真机 `sub-header`（标题 204×18 + 按钮 86×24 + 按钮 67×18）宽差 3 倍，
      //     若只判高度会新增 132 例误报；加相对宽差后**全部排除**。
      //
      //   全语料审计（753 产物 / 同一口径）：现状生效 1591 例 → 修正后新增 **94 例，
      //   父名 100% 为 `Group 2136639043`（即本事故的列表容器），零噪声**
      //   （`sub-header` / `bg` / `@echarts/bar` 均被排除）。
      const similar = kids.filter((k) => {
        const b = k.absoluteBoundingBox
        if (Math.abs(b.height - h0) >= 8) return false
        return Math.abs(b.width - w0) < Math.max(8, w0 * 0.2)
      })
      // 同尺寸（同高 + 宽度相近）兄弟数同样放宽到 3（见上方门槛说明）
      if (similar.length < 3) return null
      const sample = similar[0]
      // 🛡️ 2026-09-29：**重复单元之间**的排布方向（几何真值，复用 `areBoxesSideBySide` 统一 primitive，
      //   不新造判据）。此前只描述「单元内部布局」，未说明 N 个单元之间是横向并排还是纵向堆叠 ⇒
      //   LLM 可能把「纵向 8 行统计表」排成一行、或把「横向 3 项列表」排成一列。
      //   全语料实证：多数项为真并排（`2:8023` 3 项 2/2 并排），少数为纵向堆叠（`287:5` 统计数据 8 项 1/7）。
      const siblingSide = similar.slice(1).filter((k) => areBoxesSideBySide(sample, k)).length
      const siblingsSideBySide = siblingSide >= Math.ceil((similar.length - 1) / 2)
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
        ? '横向 flex（单元自身 flex-direction:row）：左侧 icon，右侧文字列必须为纵向列 flex-direction:column（label 在上、value 在下），禁止把 label/value 横排'
        : '按子节点 x/y 还原，禁止一律 column+居中'
      // 单元之间的排布方向（几何事实；并排时允许等宽多列 grid，堆叠时明确禁止排成一行）
      const siblingDir = siblingsSideBySide
        ? `${similar.length} 个单元之间 **横向并排**（容器 display:flex; flex-direction:row；等宽多列可用 grid）`
        : `${similar.length} 个单元之间 **纵向堆叠**（容器 display:flex; flex-direction:column，禁止排成一行）`
      return `  - 重复单元×${similar.length}（${Math.round(w0)}×${Math.round(h0)}）：${siblingDir}；**单元内部** 布局 → ${layout}${textBits.length ? `；文字色 ${textBits.join('；')}` : ''}`
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
     * - **每列 ≥ 2 项**，否则不输出：每列仅 1 项时这些"列"实为**纵向堆叠的 x 抖动**
     *   （如 card 内 bg-[m](x≈34) / con(x≈45) / t(x≈65) 各占一列）或「icon + 文字行」误读，
     *   报「N 列 × M 行」会误导 LLM 把纵向堆叠横排成一行。
     *   （2026-09-29 审计：命中 402 → 37，剔除 365 例误判，零真阳性损失。
     *     单行 N 列的 DOM 序错位另由 `横向顺序` 事实覆盖，二者互斥不重叠。）
     * - ⚠️ **仅当「DOM 子节点顺序 ≠ 视觉阅读序（行优先）」时才输出** —— 这正是 LLM
     *   按 DOM 序填 grid 会**单元格错位**的充要条件。DOM 序已与视觉序一致的容器一律不输出
     *   （2026-09-28 全语料实证：无此闸门时命中率 60.3%，头部/普通行都会被误判）。
     * - 命中 → 输出「N 列 × M 行 — 第k列(x≈X，上→下): a → b」。
     */
    // 🛡️ 节点摘要（`describeContainerLayout` 与 `collect` 的横向顺序事实共用 · 单一事实源）：
    //   TEXT 取文字；非 TEXT 若有直接 TEXT 子节点则拼其文字；否则用 name
    const nameOf = (n) => {
      if (String(n.type || '').toUpperCase() === 'TEXT') {
        return `「${String(n.characters || '').trim().slice(0, 10)}」`
      }
      // 🛡️ 递归收集后代 TEXT（深度 ≤2）：部分卡片内容组多包一层 GROUP，
      //   只取**直接**子会拼不出文字（实锤 mc-max-1790650861294 第二张卡
      //   `2:3509` → 只落到 name「Frame 2136637409」，LLM 无从对应）。
      const collectText = (x, d) => {
        if (!x || d > 2) return ''
        if (String(x.type || '').toUpperCase() === 'TEXT') return String(x.characters || '').trim()
        return (x.children || []).map((c) => collectText(c, d + 1)).join('')
      }
      const inner = collectText(n, 0)
      if (inner) return `「${inner.slice(0, 12)}」`
      return String(n.name || n.type || '?').trim() || '?'
    }

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

      // 🛡️ 「每列 ≥2 项」闸门（2026-09-29 · 全语料 40 样本实证）：
      //   若每列只有 1 项，这些"列"实为**纵向堆叠的 x 抖动**（如 card 内 bg-[m](x≈34) /
      //   con(x≈45) / t(x≈65) 各占一列）、或「icon + 文字行」误读（icon 一列、文本一列，
      //   真实布局是 row：icon 左、文字列右，由 describeRepeatedItemLayout 正确描述）、
      //   或图表轴标签。报出「3 列 × 3 行」会误导 LLM 把纵向堆叠横排成一行。
      //   审计：命中 402 → 37，剔除 365 例误判，**零真阳性损失**（37 例均为真网格错序）。
      if (!cols.every((c) => c.items.length >= 2)) return null

      // 视觉阅读序（行优先：先按行簇、再按 x）；与 DOM 序一致 → 不会错位 → 不输出
      const rowIndexOf = new Map()
      rows.forEach((r, i) => r.items.forEach((it) => rowIndexOf.set(it, i)))
      const visual = [...content].sort((a, b) => {
        const ra = rowIndexOf.get(a)
        const rb = rowIndexOf.get(b)
        if (ra !== rb) return ra - rb
        return a.absoluteBoundingBox.x - b.absoluteBoundingBox.x
      })
      // 🛡️ 2026-10-20（84af4f8f 实锤）：**行主序约束始终输出**（含 DOM 序一致时）。
      //   旧闸门「DOM 序==视觉序 ⇒ 不输出」防的是「嵌套列分组」膨胀，但网格场景的
      //   真实病灶是：LLM **不抄 DOM 序**——它把 v-for 数据数组按「先全部 label 列、
      //   再全部 value 列」的列主序自编（产物 order 字段算对了行主序、数组物理序却没
      //   按它排）⇒ 6 行×4 列字段网格整体错位，而 TEXT-001 旧二分法（xRange>yRange ⇒
      //   纯 x 排序）恰好也算出列主序 ⇒ 错错得正零检出。行主序是确定性几何事实，
      //   对已通过「每列≥2」闸门的真网格无新增误判面，成本仅一行 prompt。
      const rowMajorLine =
        `  - 字段网格(几何 · 行主序)：${cols.length} 列 × ${rows.length} 行 — ` +
        `v-for 数据数组/模板书写顺序**必须按行主序**：${visual.map(nameOf).join(' → ')}` +
        `（从左到右、从上到下逐行；禁止「先排完全部 label 列再排 value 列」的列主序）`
      if (visual.every((it, i) => it === content[i])) return rowMajorLine

      const colDesc = cols
        .map((col, i) => {
          const items = [...col.items].sort(
            (a, b) => a.absoluteBoundingBox.y - b.absoluteBoundingBox.y,
          )
          return `第${i + 1}列(x≈${Math.round(col.min)}，上→下): ${items.map(nameOf).join(' → ')}`
        })
        .join('；')
      // DOM 序 ≠ 行主序：列描述（定位错位单元格）+ 行主序硬约束（书写顺序真值）双行下发
      return `  - 内部布局(几何 · 嵌套)：${cols.length} 列 × ${rows.length} 行 — ${colDesc}\n${rowMajorLine}`
    }

    // 🛡️ 2026-09-29 治本（mc-max-1790669176199-94b3bc69 实锤）：**祖先「布局容器」的重复单元事实**
    //
    //   事故形态：planner 把「重复单元容器」标成 `layoutSource='container-rebuild'`
    //   （`isLayoutContainerSection` 为真，语义 = 「仅空间包裹、不单独生成 .vue，子区块在父模板内组装」），
    //   而 `walkLeaves` 对容器是**穿透跳过** —— 真正的容器（真机 `2:8023` = `Group 2136639043`，
    //   GROUP 378×74，3 个同尺寸子项 136:127/128/129）**永远不会成为 `startRec`**
    //   ⇒ `describeRepeatedItemLayout(2:8023)` 从不执行 ⇒ **零「重复单元×N」事实**。
    //
    //   穿透后落地的 leaf 是**重复项原型**（`136:127-list`，`itemCount=3 / renderHint='v-for'`），
    //   其 `nodes[0]` = `136:127`（单张卡「3」，141×74）—— 在单张卡身上 `describeRepeatedItemLayout`
    //   必然 null（一张卡内部是 bg/icon/label/value，并不同构），`describeContainerLayout` 又被
    //   「每列 ≥2 项」闸门排除 ⇒ **两条路径双双落空 = 零布局事实** ⇒ LLM 只能按 DOM 序把
    //   icon/label/value 竖排堆叠（产物 `.list-item{flex-direction:column}`，Figma 真值是 row）。
    //
    //   治本：为该 leaf 的**祖先容器 section 根节点**补一次 `describeRepeatedItemLayout`
    //   （**只跑这一条轨**，不跑 `describeContainerLayout`、更不跑 `横向顺序` 扫描 —— 后者若一并
    //   对祖先节点执行，会把列表的横向顺序事实**错挂到同一容器的其它兄弟 section**（实测
    //   `136:122 sub-header` 被挂上列表项顺序），并且逐祖先重复输出）。同一判据、同一口径、
    //   不产生第二套事实。由内到外取**最近的一个**命中即停（避免嵌套容器重复与 prompt 膨胀）。
    for (const anc of containerAncestors.get(String(sec.id || '')) || []) {
      const ancRootId = anc.figmaNodeId ? String(anc.figmaNodeId) : String(anc.id || '')
      const ancRaw = ancRootId ? index.get(ancRootId)?.rawNode : null
      if (!ancRaw) continue
      const repeated = describeRepeatedItemLayout(ancRaw)
      if (repeated) {
        // ⚠️ **不**递增 `itemCount`：`itemCount` 是布局轨与样式轨**共用**的配额
        //   （`collect` 的 `itemCount >= maxItemsPerSection` 闸门），布局事实递增它会
        //   把秒尾的样式真值行挤出配额（实测挤掉 `超高车辆 → 文字「超高车辆」| color:#333333 …`）。
        //   本事实的配额由输出端 `layoutLines.slice(0, maxLayoutPerSection)` 单独约束 ⇒
        //   本改动**纯增量**（只加一条布局事实，不减任何样式真值）。
        layoutLines.push(repeated)
        break
      }
    }

    // 🛡️ 2026-10-20（#128 ⑦ · 84af4f8f 实锤）：横向并列兄弟真值下发。
    //   E1 检出 rowPeerIds（y 重叠 >50% + x 分离 ⇒ 设计上是「左图右文」式横向并列），
    //   若不下发，LLM 默认把兄弟 section 纵向堆叠 ⇒ 头部拆行。配额同 layoutLines 独立轨。
    const flatTree = (treeSections || []).flatMap(function flat(s) {
      return [s, ...(Array.isArray(s.children) ? s.children.flatMap(flat) : [])]
    })
    const peerNamesOf = (peerIds) =>
      peerIds
        .map((pid) => {
          const peer = flatTree.find((x) => String(x?.id || '') === String(pid))
          return peer ? (peer.title || peer.name || pid) : pid
        })
        .join('、')
    const rowPeerLine = (names) =>
      `  - 横向并列兄弟(几何)：本区块与「${names}」**横向并列**（y 区间重叠 >50%、x 区间分离，` +
      `左图右文/左右分栏结构）⇒ 二者必须包在同一个 \`display:flex; flex-direction:row\` 容器内左右排布，` +
      `**禁止把它们纵向堆叠成上下两行**`
    if (Array.isArray(sec.rowPeerIds) && sec.rowPeerIds.length > 0) {
      layoutLines.push(rowPeerLine(peerNamesOf(sec.rowPeerIds)))
    }
    // 🛡️ 2026-10-20 ⑦-b（5ef650ff 实锤）：**peered section 被分类为布局容器时真值行随穿透被吞**。
    //   事故形态：头部两张统计卡（38:3260/38:3282，纯 icon 子树）E1 互挂 rowPeerIds ✓，
    //   但 isLayoutContainer=true ⇒ walkLeaves 穿透跳过（本节 L2702）⇒ 上面的叶子分支
    //   永远不执行 ⇒ 「横向并列」真值零下发 ⇒ LLM 把两卡纵向堆叠成两个 76px 满宽段。
    //   治本：叶子的**最近容器祖先**若带 rowPeerIds，把真值行下放到该叶子（容器语义由
    //   叶子继承输出）；同一容器只发一次（emittedRowPeerContainers 去重，防多叶子刷屏）。
    if (!Array.isArray(sec.rowPeerIds) || sec.rowPeerIds.length === 0) {
      const peeredAnc = (containerAncestors.get(String(sec.id || '')) || [])
        .find((a) => Array.isArray(a.rowPeerIds) && a.rowPeerIds.length > 0)
      if (peeredAnc) {
        const ancKey = String(peeredAnc.id || '')
        if (!emittedRowPeerContainers.has(ancKey)) {
          emittedRowPeerContainers.add(ancKey)
          layoutLines.push(rowPeerLine(peerNamesOf(peeredAnc.rowPeerIds)))
        }
      }
    }

    // 🛡️ ⑧（5ef650ff 实锤）：面板底真值下发（describePanelBase 定义见 leaf 循环外，
    //   全树兜底轨道复用同一函数）。叶子自身是面板容器 + 容器祖先是面板（穿透场景，
    //   每面板只发一次）
    // ⚠️ 去重键必须与 emittedPanelBases.add 一致（rawNode.id）；此前 filter 用 section.id
    //    而 add 用 figma 节点 id ⇒ 去重恒空转（只重复不漏，但口径混乱）。
    const panelBaseTargets = [startRec?.rawNode,
      ...(containerAncestors.get(String(sec.id || '')) || [])
        .map((a) => {
          const aid = a.figmaNodeId ? String(a.figmaNodeId) : String(a.id || '')
          return aid ? index.get(aid)?.rawNode : null
        })
        .filter((raw) => raw && !emittedPanelBases.has(String(raw.id || ''))),
    ]
    for (const target of panelBaseTargets) {
      const line = target ? describePanelBase(target) : null
      if (line) {
        layoutLines.push(line)
        const tid = String(target.id || '')
        if (tid) emittedPanelBases.add(tid)
      }
    }

    // 对每个 sourceNode 的子树提取「直接业务子元素」样式（深度受控，累积父 opacity）
    for (const rec of startNodes) {
      const raw = rec.rawNode
      if (!raw) continue
      const repeated = describeRepeatedItemLayout(raw)
      if (repeated) {
        layoutLines.push(repeated)
        itemCount++
      } else if (!/chart|echarts/.test(type)) {
        // 非重复单元 → 尝试给出「嵌套列分组」几何事实（Fix1）。
        // ⚠️ 图表段跳过：图表轴标签/图例的几何排布会被误读成"嵌套布局"（全语料实证 15 例），
        //    且图表布局另有专用注入链，不应由本事实插手。
        const containerLayout = describeContainerLayout(raw)
        if (containerLayout) {
          layoutLines.push(containerLayout)
          itemCount++
        } else {
          // 🛡️ #134：共面网格（cols≥2 且 rows≥2）不命中时，试行式网格（行 frame 堆叠形态）。
          //   二者互斥：共面网格优先（原判据语义不变），行式网格只兜「行容器堆叠」形态。
          const rowGrid = describeRowGridLayout(raw)
          if (rowGrid) {
            layoutLines.push(rowGrid)
            itemCount++
          }
        }
      }
      // 🛡️ 横向顺序事实（2026-09-29 · 全语料 40 样本 42 命中，全为真错序、零噪声）：
      //   容器「内容子 ≥3 且两两左右并列（单行）」时，若 DOM 序 ≠ x 从左到右序 →
      //   下发正确顺序。实锤（mc-max-1790650861294）：
      //   ① 车型分布卡内 `con`：DOM `[@echarts(环形), 客车组, 货车组]`，视觉 x 序
      //      `[客车组, 环形, 货车组]` ⇒ LLM 按 DOM 序排 ⇒ 环形跑到最左（卡布局错）。
      //   ② `sub-header`：DOM `[@antd/tab, tit, but-节假日预测]`，x 序 `[tit, @antd/tab, …]`。
      //   ⚠️ 必须独立于 `collect` 扫描：collect 有 `maxItemsPerSection=12` 配额，42 元素的整卡
      //      会在遍历到卡内二级容器（如 `1263:39`）前耗尽配额（实锤：同任务两张卡只触发一张）
      //      ⇒ 挂在 collect 里会让该事实**时有时无**。此处深度受控（≤3）、条数封顶（≤3）。
      if (!/chart|echarts/.test(type)) {
        const horizontalFacts = []
        const scanHorizontal = (n, depth) => {
          if (!n || depth > 3 || horizontalFacts.length >= 3) return
          const pb = n.absoluteBoundingBox
          if (pb && pb.width && pb.height) {
            const kids = (n.children || []).filter((c) => {
              const cb = c && c.absoluteBoundingBox
              if (!cb) return false
              if ((cb.width * cb.height) / (pb.width * pb.height) >= 0.9) return false
              if (Math.min(cb.width || 0, cb.height || 0) <= 8) return false
              return true
            })
            if (kids.length >= 3) {
              let allSide = true
              for (let i = 0; i < kids.length && allSide; i++) {
                for (let j = i + 1; j < kids.length && allSide; j++) {
                  if (!areBoxesSideBySide(kids[i], kids[j])) { allSide = false; break }
                }
              }
              if (allSide) {
                const sortedX = [...kids].sort(
                  (a, b2) => a.absoluteBoundingBox.x - b2.absoluteBoundingBox.x,
                )
                if (!sortedX.every((it, i) => it === kids[i])) {
                  horizontalFacts.push(
                    `  - 横向顺序(几何)：DOM 序与视觉序不符 → 从左到右应为 ${sortedX.map(nameOf).join(' → ')}`,
                  )
                }
              }
            }
          }
          for (const c of n.children || []) scanHorizontal(c, depth + 1)
        }
        scanHorizontal(raw, 0)
        for (const f of horizontalFacts) {
          layoutLines.push(f)
          itemCount++
        }
      }

      // 收集该节点子树的样式条目。parentOpacity 累积：父 GROUP 的 opacity 作用于子节点背景
      const collect = (node, depth, parentOpacity, parentBox) => {
        // ⚠️ 闸门放宽为 `collectCap`：只防超大子树，**语义取舍交给输出阶段**（文本优先）。
        if (!node || depth > maxDepth || itemCount >= collectCap) return
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
          const rights = directTextKids.map((t) => t.absoluteBoundingBox.x + t.absoluteBoundingBox.width)
          const ys = directTextKids.map((t) => t.absoluteBoundingBox.y)
          // 🛡️ 对齐判据放宽（2026-09-29 · T1 · 全语料 40 样本实证）：
          //   原仅认「左边缘对齐（同 x）」，**漏掉右边缘对齐**的纵向文本块。
          //   实锤 2:3683（当日总流量数字卡）：「34,620」(x=94,w=77) 与「江阴靖江长江隧道」
          //   (x=43,w=128) 左边缘差 51px ⇒ 原判据判不齐 ⇒ 纵向事实缺失 ⇒ 数字卡顺序无约束
          //   （对照 2:3680 左对齐 ⇒ 有事实 ⇒ 正确）。
          //   审计：仅左对齐 36、仅右对齐 36（全为真纵向文本块）⇒ 命中翻倍、零误伤。
          const sameLeft = Math.max(...xs) - Math.min(...xs) < 4
          const sameRight = Math.max(...rights) - Math.min(...rights) < 4
          const sameX = sameLeft || sameRight
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
            // 🛡️ T1 增强（2026-09-29）：DOM 序 ≠ 视觉 y 序时**必须指名具体元素顺序**。
            //   审计（全语料 40 样本）：命中「纵向文本块」容器 76 个，其中 **19 个（25%）DOM 序与视觉序相反**
            //   （实锤 2:3683 跨 8+ 轮任务稳定复现：DOM `[34,620, 江阴靖江长江隧道]`，
            //     视觉 `[江阴靖江长江隧道, 34,620]`）⇒ 只给「标签在上数值在下」的方向提示不够，
            //     LLM 照 DOM 序写就变成「数值在上」。
            //   ⚠️ 固定前缀保持不变（既有测试与审计口径依赖 `文本块纵向(...)` 子串），顺序信息以全角括号追加。
            const byY = [...directTextKids].sort(
              (a, b) => a.absoluteBoundingBox.y - b.absoluteBoundingBox.y,
            )
            const domSameAsVisual = byY.every((t, i) => t === directTextKids[i])
            layoutLines.push(
              '  - 文本块纵向(纯文本块·同左或同右对齐、y递增)：标签在上数值在下 → 该容器用 flex-direction:column' +
                (domSameAsVisual
                  ? ''
                  : `（⚠️ DOM 序与视觉序不符：从上到下应为 ${byY.map(nameOf).join(' → ')}）`),
            )
          }
        }

        if (parts.length > 0) {
          secLines.push(`  - ${clean} → ${parts.join(' | ')}`)
          // 📌 文本优先标记：**有实际字符的 TEXT 节点**才是「一等公民」（空文本/装饰不算）
          secLineIsText.push(isText && chars.length > 0)
          itemCount++
        }
        // 递归遍历子节点（collect 自身的深度控制保证了安全）
        for (const c of node.children || []) collect(c, depth + 1, effOp, bbox)
      }
      collect(raw, 1, 1, raw.absoluteBoundingBox)
    }

    if (secLines.length > 0 || layoutLines.length > 0) {
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
      // 🛡️ 布局与顺序段（2026-09-29 · 治「事实下发了但未被遵循」）：**先于**样式段输出，自带结构强指令。
      //   这四类事实（重复单元 / 内部布局嵌套 / 横向顺序 / 文本块纵向）原与 `bg:` `color:` 同段同格式，
      //   被 LLM 当作样式条目忽略（实测产物 `con` 子序仍环形最左、数字卡仍数值在上）。
      if (layoutLines.length > 0) {
        if (!layoutBannerShown) {
          layoutBannerShown = true
          lines.push(
            '> 🧭 布局与顺序真值：以下描述的是**模板子元素的书写顺序与排列方向**，属**结构要求**（不是样式建议）。\n' +
              '> · 「从左到右应为 A → B → C」⇒ 模板里三个子元素必须按 A、B、C **先后出现**，容器 `display:flex; flex-direction:row`；\n' +
              '> · 「从上到下应为 A → B」⇒ 容器 `flex-direction:column`，A 必须写在 B **之前**；\n' +
              '> · 「N 列 × M 行」⇒ 用 `display:grid` + `grid-template-columns: repeat(N, …)`；\n' +
              '> · 「重复单元×K」⇒ 用 `v-for` 渲染 K 个同构子项，骨架与方向按描述照抄。\n' +
              '> ⚠️ 违反上述顺序属于**结构缺陷**（不是样式偏差），会被结构门禁判失败。',
          )
        }
        lines.push(`**${label}**（布局与顺序真值 · 模板必须照此写）：`)
        // 🛡️ 2026-10-20 #133（477e185d 实锤）：**结构保命行不受配额裁剪**。
        //   「面板底(几何)」「横向并列兄弟(几何)」是容器级结构真值（省略=面板整组消失/头部拆行），
        //   实测 38:3206 青面板子树 51 个 section、布局行爆配额 ⇒ 面板底行（含 INNER_SHADOW
        //   发光真值）被 slice 裁掉 ⇒ 发光/底色零下发。收集与裁剪解耦：普通行按配额裁，
        //   保命行必留（mustKeep 挤占普通行额度；自身超配额时 clamp 防膨胀，退化为旧行为）。
        const KEEP_LAYOUT = /面板底\(几何\)|横向并列兄弟\(几何\)/
        const mustKeep = layoutLines.filter((l) => KEEP_LAYOUT.test(l))
        const ordinary = layoutLines.filter((l) => !KEEP_LAYOUT.test(l))
        lines.push(...ordinary.slice(0, Math.max(0, maxLayoutPerSection - mustKeep.length)))
        lines.push(...mustKeep.slice(0, maxLayoutPerSection))
      }
      if (secLines.length > 0) {
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
        // 🛡️ 2026-10-19 治本：文本优先裁剪（装饰图元让位，保证 TEXT 真值不被配额静默吃掉）
        //   配额**至少**要装下全部文本条目（实测 env-monitor `2:7899` 单段 22 条文本，
        //   固定 12 仍会丢 10 条）⇒ 文本行本身就该占的配额不外借给装饰。
        const textCount = secLineIsText.reduce((n, f) => n + (f ? 1 : 0), 0)
        const picked = pickTextPriorityLines(
          secLines,
          secLineIsText,
          Math.max(maxItemsPerSection, textCount),
        )
        lines.push(...picked.lines)
        if (picked.droppedText > 0 && typeof opts.onTextTruncated === 'function') {
          opts.onTextTruncated({
            sectionId: String(sec.id ?? ''),
            droppedText: picked.droppedText,
            droppedDeco: picked.droppedDeco,
            quota: maxItemsPerSection,
          })
        }
      }
      leafUsed++
    }
  }

  // 🛡️ #133 面板底真值全树兜底轨道（2026-10-20 477e185d 实锤）：leaf 循环有 maxLeaves=12
  //   配额窗口，排在窗口外的容器（38:3206 青面板，子树 51 个 section）其面板底/INNER_SHADOW
  //   发光真值**零宿主** ⇒ 永不下发（实测金/绿发了、青没发）。容器级结构真值不该依赖叶子
  //   配额窗口 ⇒ 循环后全树扫描「面板形态容器」，leaf 轨漏发的行独立成节补发
  //   （emittedPanelBases 按 rawNode.id 去重，每面板至多 1 行，天然有界不膨胀）。
  const panelBaseFallbackLines = []
  // #134：行式网格兜底去重（独立于面板底——面板底已发不代表行式网格已发）
  const emittedRowGrids = new Set()
  const walkForPanelBases = (secs) => {
    for (const s of secs || []) {
      if (!s) continue
      const fid = s.figmaNodeId ? String(s.figmaNodeId) : String(s.id || '')
      const raw = fid ? index.get(fid)?.rawNode : null
      if (raw && !emittedPanelBases.has(String(raw.id || ''))) {
        const line = raw ? describePanelBase(raw) : null
        if (line) {
          emittedPanelBases.add(String(raw.id || ''))
          // 行内标注 Figma 面板名，独立小节里 LLM 才能对上面板归属
          panelBaseFallbackLines.push(line.replace('面板底(几何)：', `面板底(几何)「${raw.name || raw.id}」：`))
        }
      }
      // #134：行式网格同轨兜底（38:3206 chips 网格在 leaf 窗口外 ⇒ leaf 轨零宿主）。
      //   独立 Set 去重；判据自带行宽一致性闸门，全树扫描膨胀可控。
      if (raw && !emittedRowGrids.has(String(raw.id || ''))) {
        emittedRowGrids.add(String(raw.id || ''))
        const gridLine = raw ? describeRowGridLayout(raw) : null
        if (gridLine) {
          panelBaseFallbackLines.push(
            gridLine.replace('行式网格(几何)：', `行式网格(几何)「${raw.name || raw.id}」：`),
          )
        }
      }
      if (Array.isArray(s.children)) walkForPanelBases(s.children)
    }
  }
  walkForPanelBases(treeSections)
  if (panelBaseFallbackLines.length > 0) {
    lines.push(
      '> 🧱 容器级结构真值补发（面板底色/圆角/发光 + 行式网格方向；以下容器未在上方区块出现，对应样式与布局必须落到该容器上，**禁止省略**）：',
    )
    lines.push(...panelBaseFallbackLines)
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

/**
 * 🛡️ 外观真值 CSS 化（2026-10-23，刀 53 外观扩维的**单一事实源**）。
 *
 * 这四个函数原为 `buildSectionStyleFacts` 的局部箭头函数（零闭包捕获），
 * 现提升为模块级导出，供 `folded-grid-section-takeover.js` 复用 —— 避免刀具自造
 * 第二份 fills/strokes 解析（真值口径必须单一，副本 ≥2 份 = 事故温床）。
 * 函数体逐字未变，`buildSectionStyleFacts` 的行为与提升前完全一致。
 */

/** Figma 颜色对象 → CSS 色值（alpha<1 用 rgba，否则 #hex）。 */
function cssRgba(c, opacity) {
  if (!c || typeof c.r !== 'number') return null
  const r = Math.round(c.r * 255), g = Math.round(c.g * 255), b = Math.round(c.b * 255)
  const op = typeof opacity === 'number' ? Math.round(opacity * 100) / 100 : 1
  return op < 1 ? `rgba(${r},${g},${b},${op})` : `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`
}

/**
 * 渐变方向（`gradientHandlePositions` → CSS deg；缺省 180 = 自上而下）。
 * 与 `figma-connector#_gradientAngleDeg` 同一算法（atan2）。
 */
export function gradientAngleDeg(grad) {
  const h = (grad && grad.gradientHandlePositions) || []
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

/**
 * Figma fills → CSS background 值（**纯色优先，其次渐变**，带方向 + 透明度）。
 *
 * @param {Array} fills Figma fills 数组
 * @param {number} [fillOpacity] 节点级 opacity（fill 未带 opacity 时的回落）
 * @returns {string|null}
 */
export function fillsToCss(fills, fillOpacity) {
  if (!Array.isArray(fills) || fills.length === 0) return null
  const visible = fills.filter((f) => f.visible !== false)
  const solid = visible.find((f) => f.type === 'SOLID' && f.color)
  if (solid) return cssRgba(solid.color, solid.opacity ?? fillOpacity)
  const grad = visible.find((f) => f.type?.startsWith('GRADIENT_') && f.gradientStops?.length >= 2)
  if (grad) {
    const stops = grad.gradientStops
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((s) => `${cssRgba(s.color, s.opacity ?? grad.opacity ?? fillOpacity ?? 1)} ${Math.round(s.position * 100)}%`)
      .join(', ')
    const angle = grad.type === 'GRADIENT_LINEAR'
      ? `${gradientAngleDeg(grad)}deg, `
      : grad.type === 'GRADIENT_RADIAL' ? 'radial, ' : 'conic, '
    return `linear-gradient(${angle}${stops})`
  }
  return null
}

/**
 * Figma strokes → CSS 描边色（首个可见 SOLID；非 SOLID ⇒ null）。
 * 🛡️ d70a19bf 实锤：图例条 fill.opacity=0.1 + 同色 1px strokes。此前只记 fills，
 *   描边丢失 → LLM 把半透明底写成不透明 hex，条变成实心色块。
 *
 * @param {Array} strokes Figma strokes 数组
 * @returns {string|null}
 */
export function strokesToCss(strokes) {
  if (!Array.isArray(strokes) || strokes.length === 0) return null
  const visible = strokes.filter((s) => s.visible !== false)
  const solid = visible.find((s) => s.type === 'SOLID' && s.color)
  if (!solid) return null
  return cssRgba(solid.color, solid.opacity)
}

/**
 * 节点「外观三件套」真值（刀 53 外观扩维：bg / border / 内边距）。
 *
 * - `bg`：节点首个可见 fill（纯色或渐变）→ CSS background 值；无 ⇒ null（**不猜**）
 * - `border`：首个可见 SOLID stroke + `strokeWeight` → `{width,color}`；无 ⇒ null
 * - `pad`：Auto Layout `paddingTop/Right/Bottom/Left`（缺项按 0）；非 Auto Layout ⇒ null
 *
 * 🔴 全部字段「取不到就是 null」，调用方据此**省略该属性**，绝不填默认色。
 *
 * @param {object} node Figma 原始节点
 * @returns {{ bg:string|null, border:{width:number,color:string}|null, pad:{t:number,r:number,b:number,l:number}|null }}
 */
export function nodeAppearanceTruth(node) {
  const n = node && typeof node === 'object' ? node : {}
  const bg = fillsToCss(n.fills, typeof n.opacity === 'number' ? n.opacity : undefined)
  let border = null;
  {
    const color = strokesToCss(n.strokes)
    const w = Number(n.strokeWeight)
    // 🔴 无可见描边 / 权重非法 ⇒ null（「0px 白边」比没有更糟：会画出框线）
    if (color && Number.isFinite(w) && w > 0) border = { width: Math.round(w * 100) / 100, color }
  }
  let pad = null;
  {
    const t = n.paddingTop, r = n.paddingRight, b = n.paddingBottom, l = n.paddingLeft
    if ([t, r, b, l].some((x) => x != null)) {
      pad = {
        t: Number.isFinite(Number(t)) ? Math.round(Number(t)) : 0,
        r: Number.isFinite(Number(r)) ? Math.round(Number(r)) : 0,
        b: Number.isFinite(Number(b)) ? Math.round(Number(b)) : 0,
        l: Number.isFinite(Number(l)) ? Math.round(Number(l)) : 0,
      }
    }
  }
  return { bg, border, pad }
}
