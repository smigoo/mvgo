/**
 * 判断节点或其后代是否已声明资源。
 * content/body 是否应跳过统一背景补全的唯一判据；只认结构字段，不认节点名称。
 *
 * @param {object|null} node
 * @returns {boolean}
 */
export function hasNodeResourceDeclaration(node) {
  if (!node || typeof node !== 'object') return false
  if (node.resourceFile || node.bgResource || node.bg?.resourceFile || node.backgroundImage?.src) return true
  const kids = node.children || node.items || []
  if (Array.isArray(kids) && kids.length > 0) {
    return kids.some((child) => hasNodeResourceDeclaration(child))
  }
  return false
}
