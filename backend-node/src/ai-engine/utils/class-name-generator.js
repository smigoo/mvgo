/**
 * 🛡️ L9 / COMP-001（2026-09-07）：类名同源治理
 *
 * 问题：LLM 为相同视觉结构的节点生成不同类名（如 `.tabs-list` / `.tab-list-container` / `.list-tabs`），
 * 导致 common.less 与 template 双轨、样式漂移、CODE-003 误报。
 *
 * 治本：从 Figma 节点的语义特征（name/type/视觉角色）确定性生成类名，单一事实源。
 * LLM 不再自由发挥类名，而是消费管线预分配的类名清单。
 *
 * 类名生成规则（优先级从高到低）：
 * 1. 语义角色映射（tab/header/content/icon/chart/stats）
 * 2. Figma 节点名清洗（kebab-case）
 * 3. 组件前缀 + 语义段（如 `c-monitor-tab-list`）
 *
 * @param {object} figmaNode Figma 节点（含 name/type/children）
 * @param {string} componentPrefix 组件前缀（如 `c-monitor`）
 * @returns {string} 确定性类名（如 `c-monitor-tab-list`）
 */
export function genClassKey(figmaNode, componentPrefix) {
  const prefix = componentPrefix || 'c-component';
  
  if (!figmaNode) {
    return `${prefix}-unknown`;
  }

  const nodeName = figmaNode.name || '';
  const nodeType = figmaNode.type || '';

  // 1. 语义角色映射（常见视觉模式）
  const roleMap = {
    tab: /tab/i,
    header: /header|title|头部|标题/i,
    content: /content|main|body|内容|主体/i,
    icon: /icon|图标/i,
    chart: /chart|graph|echarts|图表/i,
    stats: /stats|statistic|number|统计|数字/i,
    list: /list|items|列表/i,
    sidebar: /sidebar|side|侧栏|侧边/i,
    footer: /footer|底部/i,
    badge: /badge|徽标|角标/i,
  };

  for (const [role, pattern] of Object.entries(roleMap)) {
    if (pattern.test(nodeName) || pattern.test(nodeType)) {
      return `${prefix}-${role}`;
    }
  }

  // 2. Figma 节点名清洗（kebab-case）
  const sanitized = nodeName
    .replace(/[^a-zA-Z0-9\u4e00-\u9fa5]+/g, '-') // 非字母数字中文转 -
    .replace(/^-+|-+$/g, '') // 去首尾 -
    .toLowerCase();

  if (sanitized && sanitized.length >= 2) {
    return `${prefix}-${sanitized}`;
  }

  // 3. 兜底：按节点类型
  const typeMap = {
    FRAME: 'frame',
    GROUP: 'group',
    TEXT: 'text',
    RECTANGLE: 'rect',
    ELLIPSE: 'ellipse',
    LINE: 'line',
    VECTOR: 'vector',
  };

  const typeKey = typeMap[nodeType] || 'node';
  return `${prefix}-${typeKey}`;
}

/**
 * 批量生成类名清单（供 prompt 消费）
 * @param {Array<object>} figmaNodes Figma 节点数组
 * @param {string} componentPrefix 组件前缀
 * @returns {Map<string, string>} nodeId → className 映射
 */
export function genClassKeyBatch(figmaNodes, componentPrefix) {
  const mapping = new Map();
  if (!Array.isArray(figmaNodes)) return mapping;

  for (const node of figmaNodes) {
    if (node && node.id) {
      mapping.set(node.id, genClassKey(node, componentPrefix));
    }
  }
  return mapping;
}
