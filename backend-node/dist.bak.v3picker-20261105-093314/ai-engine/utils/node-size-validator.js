/**
 * 🛡️ P1-1（2026-08-30）：节点级尺寸绑定 —— class→figmaBox 精确校验
 *
 * ## 定位
 * P1-1 的「完整」部分：T06 阶段①+④ 已覆盖核心痛点（根尺寸套子元素→auto、
 * align-items:center 越界→auto），但「节点级尺寸绑定 + figmaNodeId 精确校验
 * （±2px BLOCK）」尚未做。
 *
 * ## 数据源
 * - `resourceDomMapping` 中 `mountTarget` 字段是 Figma 节点名（如 `tabs-list`），
 *   `figmaBox` 含 {width, height} 真值。**确定性映射，100% 精准**。
 * - `elementStyleMap` 含所有元素的 `{width, height, ...}` 但键是 Figma 节点名，
 *   与 CSS class 名的映射依赖 substring 匹配（不精确），**不作为主数据源**。
 *
 * ## 匹配策略
 * 1. **精确匹配**：CSS class 名去前缀后与 `mountTarget` 完全一致
 * 2. **后缀匹配**：CSS class 名以 `-{mountTarget}` 结尾（兼容 `c-{id}-tabs-list` 格式）
 * 3. 匹配长度相同时优先精确匹配；同一 mountTarget 被多个 class 匹配时取最长匹配
 *
 * ## 边界
 * - 只校验 `resourceDomMapping` 中有 `mountTarget` + `figmaBox` 有效尺寸的容器
 * - 不校验非资源容器（无 `mountTarget` 的容器跳过，不误报）
 * - 容忍度：±2px（Figma 浮点 → 代码整数舍入的正常误差）
 * - 同时校验 .vue 和 .less/.css 文件中的 CSS 规则
 *
 * 纯函数，可单测。
 */

/**
 * 从 resourceDomMapping 构建 class → figmaBox 映射
 * @param {Array} resourceDomMapping
 * @returns {Map<string, {width: number, height: number, figmaNodeId: string}>}
 */
export function buildNodeSizeMap(resourceDomMapping = []) {
  const map = new Map();
  if (!Array.isArray(resourceDomMapping)) return map;

  for (const entry of resourceDomMapping) {
    const mountTarget = entry.mountTarget;
    if (!mountTarget || typeof mountTarget !== 'string' || !mountTarget.trim()) continue;
    const box = entry.figmaBox;
    if (!box || typeof box !== 'object') continue;
    const w = Math.round(box.width || 0);
    const h = Math.round(box.height || 0);
    if (w === 0 && h === 0) continue;

    const key = mountTarget.trim();
    // 同 mountTarget 重复时，取尺寸更大的（更可能是真实容器）
    const prev = map.get(key);
    if (!prev || (w * h > prev.width * prev.height)) {
      map.set(key, { width: w, height: h, figmaNodeId: entry.figmaNodeId || null });
    }
  }
  return map;
}

/**
 * 解析 CSS 值中的 px 数字
 * @param {string} value - 如 "100px", "100", "auto"
 * @returns {number|null}
 */
function parsePxValue(value) {
  if (value == null) return null;
  const s = String(value).trim();
  if (s === 'auto' || s === 'initial' || s === 'inherit' || s === 'unset') return null;
  const m = s.match(/^(-?\d+(?:\.\d+)?)(?:px)?$/);
  if (!m) return null;
  return Math.round(parseFloat(m[1]));
}

/**
 * 从 CSS 规则文本中提取 width/height 的 px 值（只取直接值，不取 calc/var/百分比）
 * @param {string} cssText
 * @returns {{width: number|null, height: number|null}}
 */
function extractCssDimensions(cssText) {
  let width = null;
  let height = null;

  // 匹配 width: Npx（非 calc/var/%）
  const wm = cssText.match(/width\s*:\s*(\d+(?:\.\d+)?)\s*px\b/i);
  if (wm) width = Math.round(parseFloat(wm[1]));

  const hm = cssText.match(/height\s*:\s*(\d+(?:\.\d+)?)\s*px\b/i);
  if (hm) height = Math.round(parseFloat(hm[1]));

  return { width, height };
}

/**
 * 从 CSS class 名匹配 mountTarget（Figma 节点名）
 * @param {string} className - CSS 类名（如 "c-tunnel-key-vehicle-stats-tabs-list"）
 * @param {string} mountTarget - Figma 节点名（如 "tabs-list"）
 * @returns {boolean}
 */
function classNameMatches(className, mountTarget) {
  if (!className || !mountTarget) return false;
  const cn = className.trim();
  const mt = mountTarget.trim();
  // 精确匹配
  if (cn === mt) return true;
  // 后缀匹配：class 名以 "-{mountTarget}" 结尾
  if (cn.endsWith('-' + mt)) return true;
  // mountTarget 以 "-" 结尾（如 "tabs-list-"）→ 前缀匹配
  if (mt.endsWith('-') && cn.startsWith(mt)) return true;
  return false;
}

/**
 * 在 CSS 内容中按 class 选择器匹配 mountTarget，得到匹配的 class 名
 * @param {string} cssContent - 完整 CSS/LESS 内容
 * @param {string} mountTarget - Figma 节点名
 * @returns {string|null} 匹配到的完整 class 名（如 "c-xxx-tabs-list"）
 */
function findMatchingClass(cssContent, mountTarget) {
  if (!cssContent || !mountTarget) return null;
  // 提取所有 class 选择器（.class-name）
  const classRe = /\.([a-zA-Z_][\w-]*)\s*\{/g;
  let match;
  let best = null;
  let bestLen = 0;

  while ((match = classRe.exec(cssContent)) !== null) {
    const cn = match[1];
    if (classNameMatches(cn, mountTarget)) {
      // 取最短匹配（越短越精确，避免 "tabs-list-container" 匹配 "tabs-list"）
      if (!best || cn.length < bestLen) {
        best = cn;
        bestLen = cn.length;
      }
    }
  }
  return best;
}

/**
 * 纯函数：校验生成产物的节点尺寸是否与 Figma 真值一致
 *
 * @param {Array} files - [{path, content}] 生成文件列表
 * @param {Array} resourceDomMapping - Figma 资源映射（含 mountTarget + figmaBox）
 * @param {{tolerance?: number, componentId?: string}} options
 * @returns {Array<{id:string, severity:string, file:string, message:string}>}
 */
export function validateNodeSizes(files = [], resourceDomMapping = [], options = {}) {
  const tolerance = options.tolerance ?? 2;
  const nodeSizeMap = buildNodeSizeMap(resourceDomMapping);
  if (nodeSizeMap.size === 0) return [];

  const issues = [];

  // 遍历所有文件，提取 CSS 规则
  for (const file of files) {
    const path = file.path || '';
    const content = file.content || '';
    if (!content) continue;

    // 只处理 .vue / .less / .css 文件
    const isVue = path.endsWith('.vue');
    const isStyle = path.endsWith('.less') || path.endsWith('.css');
    if (!isVue && !isStyle) continue;

    // 提取每个 mountTarget 对应的 CSS class 并校验
    for (const [mountTarget, expected] of nodeSizeMap) {
      const matchedClass = findMatchingClass(content, mountTarget);
      if (!matchedClass) continue;

      // 找到该 class 的 CSS 规则块
      const ruleRe = new RegExp(
        '\\.' + matchedClass.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}',
        'g',
      );
      let ruleMatch;
      let maxBlock = '';
      while ((ruleMatch = ruleRe.exec(content)) !== null) {
        // 取内容最长的块（LESS 中可能有同名规则合并）
        if (ruleMatch[1].length > maxBlock.length) maxBlock = ruleMatch[1];
      }

      if (!maxBlock) continue;
      const dims = extractCssDimensions(maxBlock);

      // 只校验 Figma 真值有明确尺寸的维度
      if (expected.width > 0 && dims.width != null && Math.abs(dims.width - expected.width) > tolerance) {
        issues.push({
          id: 'NODE-001',
          severity: 'BLOCK',
          file: path,
          message: `.${matchedClass} width=${dims.width}px，Figma 真值 ${expected.width}px，偏差 ${Math.abs(dims.width - expected.width)}px > ±${tolerance}px`,
        });
      }
      if (expected.height > 0 && dims.height != null && Math.abs(dims.height - expected.height) > tolerance) {
        issues.push({
          id: 'NODE-001',
          severity: 'BLOCK',
          file: path,
          message: `.${matchedClass} height=${dims.height}px，Figma 真值 ${expected.height}px，偏差 ${Math.abs(dims.height - expected.height)}px > ±${tolerance}px`,
        });
      }
    }
  }

  return issues;
}

/**
 * 🛡️ NODE-001 确定性自愈（2026-09-01 事故 mc-max-1788248984779-862c6b29）：把挂载目标
 * 容器的 CSS width/height 锚定到 figmaBox 真值。
 *
 * 背景：NODE-001 校验（validateNodeSizes）「只判不修」——LLM 臆造尺寸（如 tabs-list
 * 高度 32px，Figma 真值 27px）→ BLOCK → 回 engineer 重试，而 LLM 因 prompt 未给「容器
 * 高度=资源图高度」硬约束，会确定性复现 32px → 重试白烧（本案还叠加 EMPTY_ARTIFACT
 * 误报耗预算，最终 fail）。
 *
 * figmaBox 是 figma-connector 的 absoluteBoundingBox（100% 确定性），报错信息已含全部
 * 数值（class/期望/实际），完全够确定性修复——把偏差超容差的 width/height 改回真值即可，
 * 无需 LLM 重试（与 LESS 补分号 / flex 补 min-height 同一种确定性后处理模式）。
 *
 * 复用同文件 findMatchingClass / extractCssDimensions / buildNodeSizeMap，与校验
 * validateNodeSizes 零口径漂移（同一 class 匹配、同一尺寸提取）。
 *
 * @param {Array} files - [{path, content}] 生成文件列表
 * @param {Array} resourceDomMapping - Figma 资源映射（含 mountTarget + figmaBox）
 * @param {{tolerance?: number}} options
 * @returns {{files: Array, fixed: number, fixes: Array<string>}}
 */
export function autoFixNodeSizes(files = [], resourceDomMapping = [], options = {}) {
  const tolerance = options.tolerance ?? 2;
  const nodeSizeMap = buildNodeSizeMap(resourceDomMapping);
  const out = (Array.isArray(files) ? files : []).map((f) => ({ ...f }));
  const fixes = [];
  let fixed = 0;
  if (nodeSizeMap.size === 0) return { files: out, fixed, fixes };

  for (const file of out) {
    const path = file.path || '';
    let content = file.content || '';
    if (!content) continue;
    if (!path.endsWith('.vue') && !path.endsWith('.less') && !path.endsWith('.css'))
      continue;

    for (const [mountTarget, expected] of nodeSizeMap) {
      const matchedClass = findMatchingClass(content, mountTarget);
      if (!matchedClass) continue;

      // 与 validateNodeSizes 同源：找该 class 内容最长的规则块
      const ruleRe = new RegExp(
        '\\.' + matchedClass.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}',
        'g',
      );
      let ruleMatch;
      let maxBlock = '';
      while ((ruleMatch = ruleRe.exec(content)) !== null) {
        if (ruleMatch[1].length > maxBlock.length) maxBlock = ruleMatch[1];
      }
      if (!maxBlock) continue;

      const dims = extractCssDimensions(maxBlock);
      let newBlock = maxBlock;

      // 只锚定「偏差超容差」的维度（在容差内不动，保持 LLM 原值，避免无谓抖动）
      if (
        expected.width > 0 &&
        dims.width != null &&
        Math.abs(dims.width - expected.width) > tolerance
      ) {
        newBlock = newBlock.replace(
          /(^|[\s;])width\s*:\s*[^;}]+;?/,
          `$1width: ${expected.width}px;`,
        );
      }
      if (
        expected.height > 0 &&
        dims.height != null &&
        Math.abs(dims.height - expected.height) > tolerance
      ) {
        newBlock = newBlock.replace(
          /(^|[\s;])height\s*:\s*[^;}]+;?/,
          `$1height: ${expected.height}px;`,
        );
      }

      if (newBlock !== maxBlock) {
        // 替换第一个出现的 maxBlock（maxBlock 是完整 body，唯一性足够）
        content = content.replace(maxBlock, newBlock);
        fixed++;
        fixes.push(
          `NODE-001: .${matchedClass} 尺寸锚定到 Figma 真值 ${expected.width}×${expected.height}px（原 ${dims.width ?? '?'}×${dims.height ?? '?'}px）`,
        );
      }
    }

    file.content = content;
  }

  return { files: out, fixed, fixes };
}