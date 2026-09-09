/**
 * Structure Order Validator — 结构顺序门禁（P0-2，零 LLM）
 *
 * 校验「生成的模板区块出现顺序」是否与「layoutStructure.sections 的 Y 坐标顺序」一致。
 * 防止 AI 视觉分析降级/Figma 兜底重建后，engineer 拿到结构约束仍把靠上区块（如 tabs）
 * 放进底部 footer 容器，导致布局颠倒。
 *
 * 设计原则（保守优先）：
 * - 只拦截「明确颠倒」：section 有 y 坐标（Figma 兜底重建）且模板中能找到对应区块、
 *   且区块出现顺序与 y 顺序相反时才判违规；找不到依据一律放行。
 * - 区块匹配用语义 role（header/tabs/chart/footer/list → class 语义词），
 *   嵌套结构（chart/tabs 都在 content 内）也能正确提取出现顺序。
 * - 校验失败重试上限由调用方（graph 条件边）控制，本模块只输出结果。
 *
 * 输出：
 * {
 *   pass: boolean,          // 通过 / 需修订
 *   detected: boolean,      // 是否检测到明确颠倒
 *   inverted: Array<{ upper, lower, upperY, lowerY }>,  // 颠倒区块对
 *   matched: Array<{ section, block, y, order }>,       // 参与比对的区块（order=模板出现序）
 *   unmatchedSections: Array<string>,  // 未匹配到模板区块的 section
 *   retryGuidance: string,  // 给 engineer 的修订指引
 * }
 */

import { extractSections } from '../utils/figma-format.js'

const logger = {
  info: (...args) => console.log('[structure-order-validator]', ...args),
  warn: (...args) => console.warn('[structure-order-validator]', ...args),
}

/**
 * 从模板提取所有带 class 的块级开启标签（含嵌套），按出现顺序返回
 * @param {string} template
 * @returns {Array<{ block: string, tag: string, classNames: string[], order: number }>}
 */
function extractAllBlocks(template) {
  if (!template) return []
  const cleaned = template.replace(/<!--[\s\S]*?-->/g, '')
  const blocks = []
  const re = /<([a-zA-Z][\w-]*)([^>]*?)(\/?)>/g
  let mm
  let order = 0
  while ((mm = re.exec(cleaned)) !== null) {
    if (mm[3] || mm[1].startsWith('!')) continue // 自闭合/注释
    const tag = mm[1]
    const attrs = mm[2] || ''
    // 只关心块级容器（div/section/main/article/aside/footer/header）
    if (!['div', 'section', 'main', 'article', 'aside', 'footer', 'header', 'ul', 'ol'].includes(tag)) continue
    const classMatch = attrs.match(/class="([^"]*)"/)
    const classNames = classMatch ? classMatch[1].split(/\s+/).filter(Boolean) : []
    if (classNames.length === 0) continue
    blocks.push({ block: classNames[0], tag, classNames, order: order++ })
  }
  return blocks
}

/**
 * 从 <template> 提取内容
 */
function extractTemplate(vueSource) {
  const m = vueSource.match(/<template>([\s\S]*?)<\/template>/)
  return m ? m[1] : null
}

/**
 * 归一化 key
 */
function normalizeKey(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/^c-/, '')
    .replace(/^[.\-#\s]+/, '')
    .replace(/[^a-z0-9\u4e00-\u9fa5]/g, '')
}

/**
 * role → class 语义词映射（用于区块匹配）
 */
const ROLE_SEMANTIC = {
  header: ['header', 'title', 'head', '标题'],
  tabs: ['tab', 'nav', 'switch', '切换'],
  chart: ['chart', 'echarts', 'graph', 'curve', '图表', '曲线'], // 'line' 太泛（gradient-line 会误命中），移除
  footer: ['footer', 'foot', 'bottom', '底部'],
  list: ['list', 'card', 'item', '列表', '卡片'],
  content: ['content', 'body', 'main'],
  section: [],
}

/**
 * 主校验入口
 * @param {Array<{ path: string, content: string }>} files - 生成的文件（含 index.vue）
 * @param {Object} layoutStructure - visual-parser/Figma 兜底产出的布局结构
 * @returns {Object} 校验结果
 */
export function validateStructureOrder(files, layoutStructure) {
  const emptyResult = { pass: true, detected: false, inverted: [], matched: [], unmatchedSections: [], retryGuidance: '' }

  try {
    const sections = extractSections(layoutStructure)
    if (!sections || sections.length === 0) return emptyResult

    // 只取带 y 坐标的 section（Figma 兜底重建的才有 figmaY）
    const ySections = sections
      .filter(s => typeof s.figmaY === 'number' || typeof s.y === 'number')
      .map(s => ({
        name: s.name || s.header?.title || s.id || '',
        role: String(s.role || s.type || 'section').toLowerCase(),
        y: typeof s.figmaY === 'number' ? s.figmaY : s.y,
        matchedBlock: null,
        matchOrder: null,
      }))
    if (ySections.length < 2) return emptyResult

    // 找主入口文件
    const mainFile = files.find(f => f.path.endsWith('index.vue')) || files[0]
    if (!mainFile) return emptyResult
    const template = extractTemplate(mainFile.content)
    if (!template) return emptyResult

    const blocks = extractAllBlocks(template)
    if (blocks.length === 0) return emptyResult

    // 匹配：对每个 section，在 blocks 中找第一个 class 语义匹配的区块
    const matchedPairs = []
    const usedBlocks = new Set()
    const usedSections = new Set()
    const tryMatchSection = (sec, secIdx) => {
      const secKey = normalizeKey(sec.name)
      const roleWords = ROLE_SEMANTIC[sec.role] || []
      for (const b of blocks) {
        if (usedBlocks.has(b.order)) continue
        const bKey = normalizeKey(b.block)
        if (!bKey) continue
        let hit = false
        // 1) class 名包含 section name（双向）
        if (secKey && (bKey.includes(secKey) || secKey.includes(bKey))) hit = true
        // 2) role 语义词命中 class（chart/tabs/header/footer...）
        if (!hit && roleWords.length > 0) {
          hit = roleWords.some(w => bKey.includes(normalizeKey(w)))
        }
        if (hit) {
          matchedPairs.push({ section: sec, block: b.block, y: sec.y, order: b.order })
          usedBlocks.add(b.order)
          usedSections.add(secIdx)
          return
        }
      }
    }
    ySections.forEach((sec, i) => tryMatchSection(sec, i))

    // 匹配不足 2 个 → 依据不足，放行（保守）
    if (matchedPairs.length < 2) {
      return {
        ...emptyResult,
        unmatchedSections: ySections.filter((_, i) => !usedSections.has(i)).map(s => s.name),
        matched: matchedPairs.map(p => ({ section: p.section.name, block: p.block, y: p.y })),
      }
    }

    // 按模板出现顺序（order）排序，检查 y 是否递增
    matchedPairs.sort((a, b) => a.order - b.order)
    const inverted = []
    for (let j = 0; j < matchedPairs.length; j++) {
      for (let k = j + 1; k < matchedPairs.length; k++) {
        const a = matchedPairs[j]
        const b = matchedPairs[k]
        // a 在模板中靠前；若 a.y > b.y → a 在图上更靠下却排在前面 → 颠倒
        if (a.y > b.y) {
          inverted.push({ upper: b.section.name, lower: a.section.name, upperY: b.y, lowerY: a.y })
        }
      }
    }

    if (inverted.length === 0) {
      return {
        ...emptyResult,
        matched: matchedPairs.map(p => ({ section: p.section.name, block: p.block, y: p.y })),
        unmatchedSections: ySections.filter((_, i) => !usedSections.has(i)).map(s => s.name),
      }
    }

    // 构建修订指引：按 y 升序列出正确顺序
    const guidanceLines = [
      '⚠️ 结构顺序校验未通过：模板区块顺序与设计稿（Figma Y 坐标）顺序不一致，存在区块上下颠倒。',
      '请严格按以下从上到下顺序排列区块（禁止把靠上区块放入底部容器）：',
    ]
    const ordered = [...matchedPairs].sort((a, b) => a.y - b.y)
    ordered.forEach((p, i) => {
      guidanceLines.push(`${i + 1}. ${p.section.name} (y=${p.y}) → 区块 class "${p.block}"`)
    })
    guidanceLines.push('顶层 DOM 顺序必须等于上表顺序，例如 tabs 区块在图表上方时，tabs 必须渲染在 chart 之前。')

    return {
      pass: false,
      detected: true,
      inverted,
      matched: matchedPairs.map(p => ({ section: p.section.name, block: p.block, y: p.y })),
      unmatchedSections: ySections.filter((_, i) => !usedSections.has(i)).map(s => s.name),
      retryGuidance: guidanceLines.join('\n'),
    }
  } catch (e) {
    logger.warn('结构顺序校验异常（非阻断放行）', e.message)
    return emptyResult
  }
}

export default validateStructureOrder
