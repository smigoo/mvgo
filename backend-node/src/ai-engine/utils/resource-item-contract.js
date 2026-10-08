/**
 * 🧩 resource-item-contract（2026-10-08 · WP2）
 *
 * 治 RC1（资源→业务项绑定无契约）/ RC3（视觉序未确定性执行）/ RC5（icon var 编号乱序）/
 * RC7（布局方向/域错置，d9a0ab7d 三问评审并入）。
 *
 * 事实地基：resourceDomMapping 已按 ownerSectionId 分组携带 bg+icon 真值与 figmaBox
 * （d9a0ab7d 实证：136:129=bg1+icon4 / 136:128=bg2+icon5 / 136:127=bg3+icon3，
 *   与 11afe1c9 逐卡正解一致）——本模块把它升格为确定性绑定契约，不再让 LLM 猜。
 *
 * 红线（宁缺勿造）：识别不出「同构卡片项序列」即返回 null，绝不猜；
 * 纯函数、无 IO、无副作用；输出供 prompt 注入与 meta 留痕共用。
 */

/** 视觉序方向判定容差：盒子 y（或 x）偏差 ≤ 0.25×最小高度（或宽度）视为对齐 */
const ALIGN_TOLERANCE_RATIO = 0.25

/** 卡片项序列的最少组数：1 组不成序列（单卡无需契约） */
const MIN_SERIES_GROUPS = 2

function _basename(p) {
  return String(p || '').split('/').pop() || ''
}

/**
 * 识别「同构卡片项序列」并输出确定性绑定契约。
 * @param {Array} resourceDomMapping - 资源映射（ownerSectionId/previewAnalysisRole/assignedVarName/figmaBox/resourceFile/downloadStatus）
 * @returns {null | {applicable:true, direction:'horizontal'|'vertical'|null, items:Array, warnings:string[]}}
 *   items: [{ order, sectionId, bgVar, bgFile, iconVar, iconFile, box:{x,y,width,height} }]（按视觉序升序）
 */
export function buildResourceItemContract(resourceDomMapping) {
  if (!Array.isArray(resourceDomMapping) || resourceDomMapping.length === 0) return null

  // 1) 只取可用（下载成功）且有变量名与几何的 bg/icon
  const usable = resourceDomMapping.filter(
    (m) =>
      m &&
      (m.previewAnalysisRole === 'bg' || m.previewAnalysisRole === 'icon') &&
      m.downloadStatus === 'success' &&
      typeof m.assignedVarName === 'string' &&
      m.assignedVarName &&
      m.ownerSectionId &&
      m.figmaBox &&
      Number.isFinite(m.figmaBox.x),
  )
  if (usable.length === 0) return null

  // 2) 按 ownerSectionId 分组；卡片项组 = 恰好 1 bg + 1 icon
  const groups = new Map()
  for (const m of usable) {
    if (!groups.has(m.ownerSectionId)) groups.set(m.ownerSectionId, { bg: null, icon: null, extra: 0 })
    const g = groups.get(m.ownerSectionId)
    if (m.previewAnalysisRole === 'bg') {
      if (g.bg) g.extra += 1
      else g.bg = m
    } else {
      if (g.icon) g.extra += 1
      else g.icon = m
    }
  }
  const cardGroups = [...groups.entries()]
    .filter(([, g]) => g.bg && g.icon && g.extra === 0)
    .map(([sectionId, g]) => ({ sectionId, bg: g.bg, icon: g.icon }))
  if (cardGroups.length < MIN_SERIES_GROUPS) return null

  // 3) 视觉序：横排按 x 升序；竖排按 y 升序；无法判定 → 保持 x 序并 warning
  const boxes = cardGroups.map((g) => g.bg.figmaBox)
  const minY = Math.min(...boxes.map((b) => b.y))
  const maxY = Math.max(...boxes.map((b) => b.y))
  const minX = Math.min(...boxes.map((b) => b.x))
  const maxX = Math.max(...boxes.map((b) => b.x))
  const minH = Math.min(...boxes.map((b) => b.height || 0)) || 1
  const minW = Math.min(...boxes.map((b) => b.width || 0)) || 1
  const warnings = []
  let direction = null
  if (Math.abs(maxY - minY) <= ALIGN_TOLERANCE_RATIO * minH && maxX - minX > 0) {
    direction = 'horizontal'
  } else if (Math.abs(maxX - minX) <= ALIGN_TOLERANCE_RATIO * minW && maxY - minY > 0) {
    direction = 'vertical'
  } else {
    warnings.push('卡片帧既非同行也对齐同列——视觉序按 x 升序输出，请人工核对')
  }

  cardGroups.sort((a, b) =>
    direction === 'vertical' ? a.bg.figmaBox.y - b.bg.figmaBox.y : a.bg.figmaBox.x - b.bg.figmaBox.x,
  )

  const items = cardGroups.map((g, i) => ({
    order: i + 1,
    sectionId: g.sectionId,
    bgVar: g.bg.assignedVarName,
    bgFile: _basename(g.bg.resourceFile),
    iconVar: g.icon.assignedVarName,
    iconFile: _basename(g.icon.resourceFile),
    box: { x: g.bg.figmaBox.x, y: g.bg.figmaBox.y, width: g.bg.figmaBox.width, height: g.bg.figmaBox.height },
  }))

  return { applicable: true, direction, items, warnings }
}

/**
 * 构建注入 prompt 的「资源绑定契约」块（微码线 / Vue3 线共用；不可辨返回空串，零开销）。
 * 同时携带 13.1 评审修正：业务容器定义 + 多 bg 1:1 + 半透明例外层的 inline 合法写法。
 */
export function buildResourceBindingPromptBlock(resourceDomMapping) {
  const contract = buildResourceItemContract(resourceDomMapping)
  if (!contract) return ''

  const dirText =
    contract.direction === 'horizontal'
      ? '横向一行（x 递增）'
      : contract.direction === 'vertical'
        ? '纵向一列（y 递增）'
        : '（方向不可辨，按 x 升序）'

  const lines = contract.items
    .map(
      (it) =>
        `- 卡片${it.order}（宿主 data-section-id="${it.sectionId}"）：**根容器** inline 背景 \`${it.bgVar}\`（${it.bgFile}）+ 图标 \`<img :src="${it.iconVar}">\`（${it.iconFile}）`,
    )
    .join('\n')

  const warnText = contract.warnings.length > 0 ? `\n⚠️ ${contract.warnings.join('；')}\n` : ''

  return `

## 🧩 资源绑定契约（视觉分析/Figma 真值确定性产出，必须逐项执行，优先于一般 bg 规则的一般表述）

以下 ${contract.items.length} 个卡片项构成${dirText}的序列。**DOM 顺序必须等于视觉序**（第 1 项在最${contract.direction === 'vertical' ? '上' : '左'}）：

${lines}
${warnText}
**执行规则（确定性，禁止偏离）**：
1. **业务容器 = 卡片根元素**（即宿主 data-section-id 对应的容器）：bg 一律绑在**卡片根元素**的 \`:style\` 上；**禁止**挂到卡片内的文本/数值/图标等**子元素**上（实锤 d9a0ab7d：bg-126 被错挂到数字 span、bg-124/bg-125 成孤儿）。
2. **多卡多 bg 必须 1:1 全引用**：上表每张 bg 都必须出现且只出现在对应卡片的根容器上；禁止两张卡共用一张 bg、禁止任何已下载 bg 不被引用。
3. **半透明背景例外层的合法写法**（唯一允许独立层的情况）：用 inline \`:style\` 的专用层 div（\`position:absolute; inset:0; pointer-events:none;\` + backgroundImage 同样走 \`:style\`），容器 relative、内容子元素 relative；**禁止**在 scoped CSS 里用 \`::before\` + \`url(...)\` 写背景层（scoped 内 url(varName) 不解析，只会产出死壳）。
4. 卡片根容器需 \`position:relative\`（有独立层时）且不设 \`overflow:hidden\` 以外的裁切。
`
}
