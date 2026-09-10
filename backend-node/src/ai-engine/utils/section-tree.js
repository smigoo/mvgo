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
