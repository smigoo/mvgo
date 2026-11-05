/**
 * 判断节点或其后代是否已声明资源。
 * content/body 是否应跳过统一背景补全的唯一判据；只认结构字段，不认节点名称。
 *
 * 🛡️ 2026-11-05（mc-max-1793869867060-e23b0b40 / mc-max-1793865322699-ef841b68 实锤）：
 *   补认 vision 契约里的**资源占位声明**形态。此前只认「已被 resourceDomMapping 解析成
 *   磁盘文件」的四类字段（resourceFile / bgResource / bg.resourceFile / backgroundImage.src），
 *   而 vision 真机输出用的是：
 *     - 节点级 `bgPlaceholder: "bg-_m-34"`
 *     - 插槽级 `icon: { placeholder: "icon-tunnel", figmaNode: "2:7626" }`
 *   ⇒ 判据对整棵子树恒 false ⇒ `_bodyChildrenHaveResources` 防线失效 ⇒ section body 被
 *   补上**子元素的**卡片底图（`bg-_m-35.png` 191×82）并 `100% 100%` 拉成巨环；同一张图
 *   还被补到两个不同 section（88:33 与 2:3438 同源）。
 *
 *   为什么占位声明应等价于「已声明资源」：本判据要回答的是「该容器是否已由子元素承载背景」，
 *   占位声明的语义正是「这一层带图、渲染由它自己负责」，差别只在「还没解析出磁盘文件」。
 *   把「未解析」当成「没有」是把契约缺口读成了内容缺口。
 *
 *   形态判定（不认名字、不认角色 role）：非空字符串即算声明。纯语义标记（如
 *   `body-bg-daily-flow`）同样算 —— 它恰恰说明「设计认为这层有背景但没给真实图」，
 *   此时仍应由子元素渲染，而不是把某张具体卡片底图提升到父级铺满整段。
 *
 * @param {object|null} node
 * @returns {boolean}
 */

/** vision 契约的资源占位声明形态（非已解析文件） */
function _hasPlaceholderDeclaration(node) {
  const bgPh = node?.bgPlaceholder
  if (typeof bgPh === 'string' && bgPh.trim()) return true
  const iconPh = node?.icon?.placeholder
  if (typeof iconPh === 'string' && iconPh.trim()) return true
  return false
}

export function hasNodeResourceDeclaration(node) {
  if (!node || typeof node !== 'object') return false
  if (node.resourceFile || node.bgResource || node.bg?.resourceFile || node.backgroundImage?.src) return true
  if (_hasPlaceholderDeclaration(node)) return true
  const kids = node.children || node.items || []
  if (Array.isArray(kids) && kids.length > 0) {
    return kids.some((child) => hasNodeResourceDeclaration(child))
  }
  return false
}
