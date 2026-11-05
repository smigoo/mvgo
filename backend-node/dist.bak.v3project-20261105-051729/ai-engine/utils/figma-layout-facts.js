/**
 * figma-layout-facts.js
 *
 * 从 Figma 节点树提取布局事实（子元素数量、精确尺寸、间距）。
 * 
 * 背景（2026-09-21 · c-device-monitor-bd796f8b 实锤）：
 *   - 视觉分析能输出布局方向（vertical/horizontal/grid/flex），但不能输出精确 gap/尺寸
 *   - Figma 节点树包含精确的 absoluteBoundingBox（宽高）、itemSpacing（间距）
 *   - 需要合并两者：视觉提供布局方向，Figma 提供精确尺寸/间距
 * 
 * 职责：
 *   1. 从 Figma 节点树提取每个容器的子元素数量（用于 flex 注入判断）
 *   2. 从 Figma 节点树提取精确尺寸/间距（用于 CSS 生成）
 *   3. 与 vision JSON 合并，生成完整的布局事实
 * 
 * 纯函数，可单测。
 */

/**
 * 从 Figma 节点树提取每个容器的子元素数量。
 * 
 * 用途（2026-09-21 · c-device-monitor-bd796f8b 实锤）：
 *   - flex 过度注入根因：resource-mounter 规则⑤只看 CSS 属性名，不判断元素类型和子元素数量
 *   - 导致叶子节点（img/span/单图标 wrapper）被注入 flex → 浏览器忽略无效属性
 *   - 治本：从 Figma 节点树提取每个容器的子元素数量，传入 ctx.selectorChildCounts
 *   - 规则⑤根据子元素数量判断是否注入 flex（≤1 不加，≥2 加）
 * 
 * @param {Object} figmaNodeData Figma 节点树（figma-node-data.json 的 document 字段）
 * @param {Array} alignedSections alignSectionClasses 返回的对齐结果（可选）
 * @returns {Record<string, number>} { className: childCount } 映射
 */
export function buildSelectorChildCounts(figmaNodeData, alignedSections = null) {
  if (!figmaNodeData || typeof figmaNodeData !== 'object') return {};
  
  const result = {};
  const nodeMap = new Map(); // nodeId → node
  
  // 递归遍历 Figma 节点树，建立 nodeId → node 映射
  const traverse = (node) => {
    if (!node || typeof node !== 'object') return;
    if (node.id) {
      nodeMap.set(node.id, node);
    }
    if (Array.isArray(node.children)) {
      node.children.forEach(traverse);
    }
  };
  
  traverse(figmaNodeData);
  
  // 如果提供了对齐结果，按对齐结果提取
  if (Array.isArray(alignedSections)) {
    for (const { cls, sec } of alignedSections) {
      // 从 section 的 sourceNodeIds 中找到对应的 Figma 节点
      const sourceNodeIds = Array.isArray(sec?.sourceNodeIds) ? sec.sourceNodeIds : [];
      for (const nodeId of sourceNodeIds) {
        const node = nodeMap.get(String(nodeId));
        if (node) {
          const childCount = Array.isArray(node.children) ? node.children.length : 0;
          result[cls] = childCount;
          break; // 找到第一个就停止
        }
      }
    }
    return result;
  }
  
  // 否则，提取所有容器的子元素数量（className → childCount）
  for (const [nodeId, node] of nodeMap.entries()) {
    // 从节点名提取 className（微码组件命名约定：c-{componentId}-{name}）
    const nodeName = String(node.name || '');
    const classNameMatch = nodeName.match(/^(c-[a-z0-9-]+)-([a-z0-9-]+)$/i);
    if (classNameMatch) {
      const className = classNameMatch[1]; // 取前缀作为 className
      const childCount = Array.isArray(node.children) ? node.children.length : 0;
      result[className] = childCount;
    }
  }
  
  return result;
}

/**
 * 从 Figma 节点树提取精确尺寸和间距。
 * 
 * 用途（2026-09-21 · c-device-monitor-bd796f8b 实锤）：
 *   - 视觉分析能输出布局方向（vertical/horizontal），但不能输出精确 gap/尺寸
 *   - Figma 节点树包含精确的 absoluteBoundingBox（宽高）、itemSpacing（间距）
 *   - 此处提取精确值，与 vision JSON 合并后传给 CSS 生成
 * 
 * @param {Object} figmaNodeData Figma 节点树（figma-node-data.json 的 document 字段）
 * @param {Object} cssSelectorToFigmaNodeMap CSS 选择器 → Figma 节点 ID 映射（可选）
 * @returns {Record<string, {width: number, height: number, gap: number|null}>} 
 *   { className: { width, height, gap } } 映射
 */
export function buildFigmaPreciseLayout(figmaNodeData, cssSelectorToFigmaNodeMap = null) {
  if (!figmaNodeData || typeof figmaNodeData !== 'object') return {};
  
  const result = {};
  const nodeMap = new Map(); // nodeId → node
  
  // 递归遍历 Figma 节点树，建立 nodeId → node 映射
  const traverse = (node) => {
    if (!node || typeof node !== 'object') return;
    if (node.id) {
      nodeMap.set(node.id, node);
    }
    if (Array.isArray(node.children)) {
      node.children.forEach(traverse);
    }
  };
  
  traverse(figmaNodeData);
  
  // 如果提供了 CSS 选择器 → Figma 节点 ID 映射，按映射提取
  if (cssSelectorToFigmaNodeMap) {
    for (const [selector, nodeId] of Object.entries(cssSelectorToFigmaNodeMap)) {
      const node = nodeMap.get(nodeId);
      if (node) {
        const box = node.absoluteBoundingBox || {};
        const gap = node.itemSpacing ?? null;
        result[selector] = {
          width: box.width || 0,
          height: box.height || 0,
          gap: typeof gap === 'number' ? gap : null,
        };
      }
    }
    return result;
  }
  
  // 否则，提取所有容器的精确尺寸/间距（className → layout）
  for (const [nodeId, node] of nodeMap.entries()) {
    // 从节点名提取 className（微码组件命名约定：c-{componentId}-{name}）
    const nodeName = String(node.name || '');
    const classNameMatch = nodeName.match(/^(c-[a-z0-9-]+)-([a-z0-9-]+)$/i);
    if (classNameMatch) {
      const className = classNameMatch[1]; // 取前缀作为 className
      const box = node.absoluteBoundingBox || {};
      const gap = node.itemSpacing ?? null;
      result[className] = {
        width: box.width || 0,
        height: box.height || 0,
        gap: typeof gap === 'number' ? gap : null,
      };
    }
  }
  
  return result;
}

export default {
  buildSelectorChildCounts,
  buildFigmaPreciseLayout,
};
