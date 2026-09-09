/**
 * 🛡️ Phase 3 L10（2026-09-07）：定宽/定高区块归一化
 * 
 * 问题：LLM 生成的组件中，显式 width/height 的区块（如侧栏、tab 条、图标）
 * 同时写了 flex-grow: 1，导致 flex 引擎覆盖显式尺寸，把 46px 侧栏撑满整个剩余宽度。
 * 
 * 治本：检测显式尺寸（width/height 含 px 值）的区块，将其 flex 属性强制归一化为
 * `flex: 0 0 auto`（禁止 grow/shrink，保持原始尺寸）。
 * 
 * 规则：
 * - 显式 width（含 px）→ flex-grow: 0, flex-shrink: 0
 * - 显式 height（含 px）→ flex-grow: 0, flex-shrink: 0
 * - 已有 flex: 0 0 auto 或 flex-grow: 0 的区块不重复处理
 * - 豁免根容器（.xxx-root）和内容主区（.xxx-content），它们需要 grow 分配剩余空间
 */

/**
 * 归一化定宽/定高区块的 flex 属性
 * @param {string} cssContent - CSS/Less 文件内容
 * @param {string} [componentPrefix] - 组件前缀（如 c-monitor），用于识别根容器
 * @returns {{ content: string, normalized: string[] }}
 */
export function normalizeFixedSizeFlex(cssContent, componentPrefix = '') {
  if (!cssContent || typeof cssContent !== 'string') {
    return { content: cssContent, normalized: [] };
  }

  const normalized = [];
  
  // 匹配 CSS 块：选择器 { ... }
  // 支持多行、嵌套（LESS 父引用 &）
  const blockRegex = /([^{}]+)\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g;
  
  let result = cssContent.replace(blockRegex, (match, selector, body) => {
    const selectorTrimmed = selector.trim();
    
    // 豁免根容器和内容主区（它们需要 grow）
    if (componentPrefix) {
      const rootPattern = new RegExp(`\\.${componentPrefix}-root`, 'i');
      const contentPattern = new RegExp(`\\.${componentPrefix}-content`, 'i');
      if (rootPattern.test(selectorTrimmed) || contentPattern.test(selectorTrimmed)) {
        return match;
      }
    }
    
    // 检测显式尺寸（width/height 含 px 值）
    const hasExplicitWidth = /(?:^|[^-])width\s*:\s*\d+px/i.test(body);
    const hasExplicitHeight = /(?:^|[^-])height\s*:\s*\d+px/i.test(body);
    
    if (!hasExplicitWidth && !hasExplicitHeight) {
      return match; // 无显式尺寸，不处理
    }
    
    // 检查是否已有 flex: 0 0 auto 或 flex-grow: 0
    if (/flex\s*:\s*0\s+0\s+auto/i.test(body) || /flex-grow\s*:\s*0/i.test(body)) {
      return match; // 已归一化，跳过
    }
    
    // 归一化 flex 属性
    let newBody = body;
    
    // 移除已有的 flex-grow / flex-shrink / flex-basis
    newBody = newBody.replace(/flex-grow\s*:[^;]+;?/gi, '');
    newBody = newBody.replace(/flex-shrink\s*:[^;]+;?/gi, '');
    newBody = newBody.replace(/flex-basis\s*:[^;]+;?/gi, '');
    
    // 移除简写 flex（如 flex: 1 1 0）
    newBody = newBody.replace(/flex\s*:[^;]+;?/gi, '');
    
    // 注入 flex: 0 0 auto
    // 在最后一个属性后添加（保持格式）
    const lastPropMatch = newBody.match(/([^;]+;)\s*$/);
    if (lastPropMatch) {
      newBody = newBody.replace(/([^;]+;)\s*$/, '$1\n  flex: 0 0 auto;');
    } else {
      // 空块或无属性
      newBody = newBody.trim() + '\n  flex: 0 0 auto;\n';
    }
    
    normalized.push(selectorTrimmed);
    return `${selectorTrimmed} {${newBody}}`;
  });
  
  return { content: result, normalized };
}
