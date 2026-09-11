/**
 * @file lite-style-extractor.js — 🛡️ P1.8 修复（2026-09-11）
 *
 * 问题：lite 路径的 LLM 输出是「单文件完整组件」，所有样式都在 index.vue 的 <style> 里。
 * 此前 buildMcSkeleton 无条件覆盖所有文件，导致 common.less 只有空骨架、业务样式丢失；
 * @import 注入到 <style scoped> 内，作用域隔离导致主题变量无法传播。
 *
 * 解决方案：
 * 1. 提取 index.vue 的 <style> 内容（业务样式）
 * 2. 把业务样式写入 common.less（不是空骨架）
 * 3. index.vue 只保留非 scoped 的 @import 引用
 * 4. 字号归一化（M5-6/M5-7）
 */

import { normalizeFontSizeLiterals } from './font-size-normalizer.js';

/**
 * 从 lite 路径的 Vue SFC 提取业务样式并准备最终产物
 * @param {string} vueCode - LLM 生成的原始 Vue SFC
 * @param {string} componentName - 组件名（用于日志）
 * @returns {{ vueFinal: string, businessStyles: string, styleStats: object }}
 */
export function extractAndPrepareLiteMicrocodeStyles(vueCode, componentName = 'component') {
  const stats = {
    fontNormalized: false,
    styleLinesExtracted: 0,
    importInjected: false,
  };

  if (!vueCode || typeof vueCode !== 'string') {
    return {
      vueFinal: vueCode || '',
      businessStyles: '',
      styleStats: stats,
    };
  }

  // 1. 提取 <style> 块内容
  const styleMatch = vueCode.match(/<style([^>]*)>([\s\S]*?)<\/style>/i);
  let businessStyles = '';
  let vueWithoutStyle = vueCode;

  if (styleMatch) {
    const styleAttrs = styleMatch[1] || '';
    const styleContent = styleMatch[2] || '';

    // 清理样式内容：移除已有的 @import（避免重复）
    businessStyles = styleContent
      .replace(/@import\s+['"][^'"]*index\.less['"]\s*;?/g, '')
      .replace(/@import\s+['"][^'"]*resources\/styles[^'"]*['"]\s*;?/g, '')
      .trim();

    stats.styleLinesExtracted = businessStyles.split('\n').filter(l => l.trim()).length;

    // 2. 从原 Vue 文件中移除 <style> 块（后续会重新注入非 scoped 版本）
    vueWithoutStyle = vueCode.replace(/<style[^>]*>[\s\S]*?<\/style>/i, '').trim();
  }

  // 3. 字号归一化（M5-6/M5-7）
  let processedStyles = businessStyles;
  if (businessStyles) {
    const normalized = normalizeFontSizeLiterals(businessStyles);
    processedStyles = normalized.text;
    stats.fontNormalized = normalized.changes.length > 0;
  }

  // 4. 构建最终的 index.vue：非 scoped 的 @import + 业务样式
  // 关键：不使用 scoped，让主题变量能传播到子组件
  const styleBlock = processedStyles
    ? `<style lang="less">
@import './resources/styles/index.less';

${processedStyles}
</style>`
    : `<style lang="less">
@import './resources/styles/index.less';
</style>`;

  stats.importInjected = true;

  // 5. 组合最终产物
  const vueFinal = `${vueWithoutStyle}

${styleBlock}
`;

  return {
    vueFinal,
    businessStyles: processedStyles,
    styleStats: stats,
  };
}
