/**
 * 导航 section 必含工具（P0 修复：#2b 导航作为必含 section / #3 styleMappings 含 nav 进入工程师上下文）
 *
 * 根因：visual-parser.inferRole 此前把含「导航/nav/菜单/侧边」的节点错归为 tabs，
 * 而 subcomponent-planner 又没有 nav 类型 → 左侧竖向导航根本不进入 effectiveSections，
 * 模型永不生成导航（实测 mc-max-1787793678799 导航整段缺失）。
 *
 * 本工具在规划阶段检测导航信号，若缺失则强制注入 nav section，使其成为「必含 section」
 * （与既有 sections 一起参与强制拆分判定），从而让导航的样式事实（styleMappings / elementStyleMap 已进 prompt）被模型消费。
 */

import { collectLeafSections, findSectionById } from './section-tree.js'

const NAV_KEYWORDS = [
  '导航', 'nav', '菜单', '侧边', 'sidebar', 'menu', '纵向导航', '竖向导航', 'navigation',
]

function containsNavSignal(text = '') {
  if (!text) return false
  const lower = String(text).toLowerCase()
  return NAV_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()))
}

/**
 * 从可用信号源检测是否存在导航（任意一源命中即视为有导航）。
 * @param {{layoutStructure?:object, styleMappings?:object, elementStyleMap?:object, figmaNodeData?:object}} sources
 * @returns {boolean}
 */
export function detectNavSignal(sources = {}) {
  const { layoutStructure, styleMappings, elementStyleMap, figmaNodeData } = sources

  // 1) layoutStructure.sections 已含 nav 类型（经 subcomponent-planner 识别）
  const sections =
    layoutStructure?.layout?.sections ||
    layoutStructure?.sections ||
    []
  for (const sec of sections) {
    const hay = `${sec?.id || ''} ${sec?.name || ''} ${sec?.header?.title || ''} ${sec?.role || ''}`.toLowerCase()
    if (containsNavSignal(hay)) return true
  }

  // 2) styleMappings / elementStyleMap / figmaNodeData 任意字段含导航关键词
  for (const obj of [styleMappings, elementStyleMap, figmaNodeData]) {
    if (!obj) continue
    try {
      if (containsNavSignal(JSON.stringify(obj))) return true
    } catch {
      // 序列化失败跳过
    }
  }
  return false
}

/**
 * 统计「导航元素」数量：从 Figma 节点树 / elementStyleMap 中数出名称含导航关键词的节点。
 * 用于判断导航信号是真有内容支撑，还是仅文本关键词命中。
 * @param {{figmaNodeData?:object, elementStyleMap?:object}} sources
 * @returns {number}
 */
function countNavElements(sources = {}) {
  const { figmaNodeData, elementStyleMap } = sources
  let count = 0

  const root = figmaNodeData?.document || figmaNodeData
  if (root && typeof root === 'object') {
    const walk = (node) => {
      if (!node || typeof node !== 'object') return
      const hay = `${node.name || ''} ${node.characters || ''}`
      if (containsNavSignal(hay)) count += 1
      const children = node.children || []
      for (const child of children) walk(child)
    }
    walk(root)
  }

  if (elementStyleMap && typeof elementStyleMap === 'object') {
    for (const key of Object.keys(elementStyleMap)) {
      if (containsNavSignal(key)) count += 1
    }
  }

  return count
}

/**
 * 若检测到导航信号但 plan.effectiveSections 尚无 nav section，则强制注入。
 * 注入后按既有规则重算 isForced / minFiles（>=3 强制拆分）。
 *
 * 🛡️ P1 修复（2026-08-28 mc-max-1787912301033 实锤）：
 *   旧实现无条件注入 elementCount=0 的空 section，且缺 complexityScore / layoutMetadata /
 *   internalSubcomponents / shouldSplitInternally 等字段，与其余 section 结构不一致。
 *   后果：planner 承诺 3 个 section，但空 section 无内容可生成（子组件只产出 2 个），
 *   模型却按清单脑补出 NavTabs.vue / DeviceGrid.vue 的 import → 「幽灵引用」→ 孤儿清退。
 *   现在：先统计真实导航元素数，为 0 说明只是关键词命中、无实际节点支撑，
 *   注入空 section 只会误导模型 → 直接不注入。
 *
 * @param {object} plan
 * @param {boolean} navSignal
 * @param {{figmaNodeData?:object, elementStyleMap?:object}} [sources] 用于统计导航元素数
 * @returns {object} 可能修改后的 plan（新对象，不污染入参）
 */
function isNavSection(sec) {
  const hay = `${sec?.id || ''} ${sec?.title || ''} ${sec?.responsibility || ''}`.toLowerCase()
  return containsNavSignal(hay) || /(^|\s)nav(\s|$)/.test(hay) || /sidebar/.test(hay)
}

export function injectNavSectionIfMissing(plan, navSignal, sources = {}) {
  if (!navSignal) return plan
  const effectiveSections = Array.isArray(plan?.effectiveSections) ? plan.effectiveSections : []
  const hasNav = !!(
    findSectionById(effectiveSections, 'nav') ||
    collectLeafSections(effectiveSections).some(isNavSection)
  )
  if (hasNav) return plan

  // 无实际导航节点支撑时，不注入空 section（避免误导模型产生幽灵引用）
  const navElementCount = countNavElements(sources)
  if (navElementCount === 0) {
    return plan
  }

  const navSection = {
    id: 'nav',
    responsibility: '竖向导航区（分类/菜单切换）',
    elementCount: navElementCount,
    title: '导航',
    // 补齐与其余 section 一致的字段，避免结构不一致导致下游按缺失字段降级
    complexityScore: 0,
    complexityReasons: {
      elementCount: navElementCount,
      charts: 0,
      interactions: 0,
      maxDepth: 1,
    },
    layoutMetadata: {
      direction: 'column',
      alignItems: 'flex-start',
      justifyContent: 'flex-start',
      gap: 0,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
    },
    internalSubcomponents: [],
    shouldSplitInternally: false,
  }
  const nextSections = [...effectiveSections, navSection]
  const leafCount = collectLeafSections(nextSections).length
  const minSectionsForced = 3
  const isForced = leafCount >= minSectionsForced
  return {
    ...plan,
    effectiveSections: nextSections,
    isForced,
    minFiles: isForced ? leafCount : 0,
    reason: isForced
      ? `叶子 sections=${leafCount} ≥ ${minSectionsForced} → 强制拆分（含强制注入的导航 section）`
      : `叶子 sections=${leafCount} < ${minSectionsForced} → 不强制拆分（已注入导航 section）`,
  }
}
