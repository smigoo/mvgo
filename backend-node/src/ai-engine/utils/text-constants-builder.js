/**
 * 🛡️ Phase 4 L11（2026-09-07）：文案白名单字面量注入
 *
 * 问题：LLM 生成文案时自由发挥（如「南北接线 设备」→「房屋建筑设备」），TEXT-TRUTH 事后检测
 * 虽然能 BLOCK，但重试仍基于同一份错误 vision 结果 → 必然重复失败 → 重试耗尽。
 *
 * 治本：事前注入。把 Figma TEXT 节点的真值作为 `textConstants` 清单注入 prompt，LLM 生成
 * `<template>` 时所有静态文案必须从这个清单里取，禁止臆造。从源头避免文案篡改，而不是事后检测。
 *
 * 单一事实源：复用 `text-truth-guard.js` 的 `collectFigmaTextTruth`，不重复实现遍历逻辑。
 *
 * @param {object} figmaNodeData Figma 节点树
 * @returns {Array<{text:string, nodeId:string, nodeName:string}>} 去重后的文案清单
 *   （按文本长度降序排列，长文案优先——长文案更可能是标题/核心文案，短文案更可能是装饰文字）
 */
export function buildTextConstantsManifest(figmaNodeData) {
  const seen = new Map(); // text → {nodeId, nodeName}
  const walk = (node, depth = 0) => {
    if (!node || typeof node !== 'object' || depth > 10) return;
    if (node.type === 'TEXT' && typeof node.characters === 'string') {
      const text = node.characters.trim();
      if (text && !seen.has(text)) {
        seen.set(text, {
          nodeId: node.id || '',
          nodeName: node.name || '',
        });
      }
    }
    if (Array.isArray(node.children)) {
      for (const c of node.children) walk(c, depth + 1);
    }
  };
  walk(figmaNodeData);

  // 按文本长度降序排列（长文案优先）
  return Array.from(seen.entries())
    .map(([text, meta]) => ({ text, ...meta }))
    .sort((a, b) => b.text.length - a.text.length);
}

/**
 * 生成文案清单 Markdown 段（注入 prompt）
 * @param {object} figmaNodeData Figma 节点树
 * @returns {string} Markdown 表格（无文案时返回空串）
 */
export function buildTextConstantsSection(figmaNodeData) {
  const constants = buildTextConstantsManifest(figmaNodeData);
  if (constants.length === 0) return '';

  const lines = constants.map((c, i) => {
    return `| ${i + 1} | \`${c.text}\` | \`${c.nodeName}\` |`;
  });

  return `## 📝 文案白名单（L11 确定性文案，**必须使用，禁止臆造**）

> 🔴 **最高优先级约束**：以下文案清单是**唯一合法事实源**，生成 \`<template>\` 时所有静态文案（标签之间的文字）**必须逐字使用**，禁止任何形式的变体（同义词替换/缩写/扩写/臆造）。

| 序号 | 文案内容 | Figma 节点名 |
|------|----------|--------------|
${lines.join('\n')}

**🚫 违规示例（会被门禁拦截）**：
- ❌ 清单里没有「房屋建筑设备」→ ✅ 应使用「南北接线 设备」（序号 X）
- ❌ 清单里没有「烟雾机器人」→ ✅ 应使用「烟道机器人」（序号 Y）
- ❌ 自行缩写/扩写/同义词替换 → ✅ 必须逐字使用清单文案

**✅ 正确做法**：
1. \`<template>\` 里所有静态文案（如 \`<span>监控</span>\`）**必须**从清单中选择
2. 如果清单里没有你需要的文案，说明 Figma 设计稿里就没有这段文字 → **删除该区块**，不要臆造
3. 数字/单位/符号同样适用（如「3/3740」不能写成「3/740」）
`;
}
