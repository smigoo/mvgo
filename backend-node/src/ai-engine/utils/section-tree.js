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
 * 🛡️ 治本（2026-09-11 · c-device-monitor-hsvmkuvd-cfb53488 实锤）：planner 双重解释去重。
 *
 * 实锤链路：同一主内容区被 planner 产出两个叶子——`89:37`（@antd/tab，elementCount=2，
 * antd 组件壳）与臆造语义壳 `section-main-content`（主内容区（Tab切换+设备网格），elementCount=16），
 * 两者 type=tabs 且 responsibility 同为「标签页切换区」→ 层①模板装出两个组件 →
 * LLM 各自生成「左垂直 tab 栏 + 右设备网格」完整副本 → **两个大 tabs 重复出现**。
 *
 * 确定性去重规则（递归整棵树）：
 *   ① sourceNodeIds 单一归属（R1-1，优先级最高、不依赖措辞）：任一 Figma 节点 id 只能归属
 *     一个叶子 section（layout 容器除外）；两个叶子 sourceNodeIds 有交集 → 保留 elementCount 更大者。
 *   ② type=tabs 措辞兜底（原规则）：按 `type|responsibility` 分组，组内 >1 保留 elementCount 更大者。
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
  return out
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
  const extra = sec.elementCount ? `，含 ${sec.elementCount} 个元素` : ''
  const score =
    sec.complexityScore !== undefined ? `，复杂度 ${sec.complexityScore}` : ''
  return `${pad}- \`${sec.id}\` — ${sec.responsibility || sec.type || '区块'}${title}${layout}${extra}${score}`
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
 * 规则：系统按 leaf section 的 type / responsibility 做**稳定映射**得到一个确定名，同名冲突时
 * 加序号去重。这样「模板段 <Xxx />、脚本段 import、子组件文件名」三者都拿到同一个确定名，
 * 从机制上消灭「命名多解释者」。
 *
 * 纯函数、无 import.meta，供 prompt-builder / code-generator / microcode-engineer 共用。
 * @param {Array} treeSections - effectiveSections（含容器嵌套）
 * @returns {Map<string,string>} sectionId → PascalCase 确定名
 */
export function assignSectionComponentNames(treeSections) {
  const leaves = collectLeafSections(treeSections);
  const used = new Set();
  const nameOf = new Map();
  for (const sec of leaves) {
    if (!sec) continue;
    const resp = String(sec.responsibility || '').toLowerCase();
    const type = String(sec.type || '').toLowerCase();
    let base;
    // type 优先（planner 显式派生，确定性最强），responsibility 关键词兜底（精确匹配，避免
    // 「数据统计指标区（数字+标签+趋势）」里的「标签」被误判成 tabs）。
    if (type === 'chart') {
      base = 'ChartSection';
    } else if (type === 'tabs') {
      base = 'TabsSection';
    } else if (type === 'stats') {
      base = 'StatsSection';
    } else if (type === 'grid') {
      base = 'CardGrid';
    } else if (type === 'list') {
      base = 'ListSection';
    } else if (type === 'switch') {
      base = 'SwitchSection';
    } else if (type === 'header') {
      base = 'HeaderSection';
    } else if (type === 'body') {
      base = 'MainSection';
    } else if (resp.includes('图表') || resp.includes('可视化')) {
      base = 'ChartSection';
    } else if (resp.includes('标签页') || resp.includes('切换栏') || resp.includes(' tab')) {
      base = 'TabsSection';
    } else if (resp.includes('switch') || resp.includes('切换')) {
      base = 'SwitchSection';
    } else if (resp.includes('统计') || resp.includes('指标') || resp.includes('概览')) {
      base = 'StatsSection';
    } else if (resp.includes('网格') || resp.includes('卡片')) {
      base = 'CardGrid';
    } else if (resp.includes('列表') || resp.includes('清单')) {
      base = 'ListSection';
    } else if (resp.includes('标题') || resp.includes('控件')) {
      base = 'HeaderSection';
    } else if (resp.includes('主内容') || resp.includes('主体')) {
      base = 'MainSection';
    } else {
      base = 'ContentSection';
    }
    // 同名去重：第二个起加序号
    let name = base;
    let i = 2;
    while (used.has(name)) {
      name = `${base}${i}`;
      i += 1;
    }
    used.add(name);
    nameOf.set(String(sec.id), name);
  }
  return nameOf;
}
