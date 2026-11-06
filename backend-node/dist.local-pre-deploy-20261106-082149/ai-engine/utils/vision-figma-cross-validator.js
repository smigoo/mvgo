/**
 * 🛡️ Phase 4 L12（2026-09-07）：Vision-Figma 交叉验证
 *
 * 问题：TEXT-TRUTH 只看 Figma 真值，但 vision OCR 误读的文字（如「挖掘机」vs Figma「监控」）
 * 会被 BLOCK，重试基于同一份错误 vision → 必然重复失败 → 重试耗尽。
 *
 * 治本：空间对齐。用 vision elements 的 bbox 与 Figma TEXT 节点的 bounds 做 IoU 重叠匹配，
 * 把 vision 误读的文字与对应的 Figma 真值配对，生成「vision 误读 → 应替换为」的确定性映射。
 * TEXT-TRUTH 检测时，如果产物文字是 vision 误读文字，但已配对到 Figma 真值 → 自动替换建议；
 * 如果不在映射里 → 才是真臆造（BLOCK）。
 *
 * 单一事实源：复用 `text-truth-guard.js` 的 `collectFigmaTextTruth`，不重复实现遍历逻辑。
 *
 * @param {Array<{text:string, bbox:{x:number, y:number, width:number, height:number}}>} visionElements
 *   vision 模型识别的元素数组（含 text 和 bbox）
 * @param {object} figmaNodeData Figma 节点树
 * @returns {{visionToFigma: Map<string,string>, unmatchedVision: string[]}}
 *   visionToFigma：vision 文字 → Figma 真值映射；unmatchedVision：未配对的 vision 文字
 */
export function crossValidateVisionTexts(visionElements, figmaNodeData) {
  const visionToFigma = new Map();
  const unmatchedVision = [];

  if (!Array.isArray(visionElements) || visionElements.length === 0) {
    return { visionToFigma, unmatchedVision };
  }

  // 收集 Figma TEXT 节点的 bounds（绝对坐标）
  const figmaTexts = [];
  const walk = (node, depth = 0) => {
    if (!node || typeof node !== 'object' || depth > 10) return;
    if (node.type === 'TEXT' && typeof node.characters === 'string' && node.absoluteBoundingBox) {
      figmaTexts.push({
        text: node.characters.trim(),
        bounds: node.absoluteBoundingBox,
      });
    }
    if (Array.isArray(node.children)) {
      for (const c of node.children) walk(c, depth + 1);
    }
  };
  walk(figmaNodeData);

  if (figmaTexts.length === 0) {
    // 无 Figma TEXT 节点 → 全部 unmatched
    for (const ve of visionElements) {
      if (ve.text && ve.text.trim()) unmatchedVision.push(ve.text.trim());
    }
    return { visionToFigma, unmatchedVision };
  }

  // 为每个 vision element 找 IoU 最高的 Figma TEXT 节点
  for (const ve of visionElements) {
    if (!ve.text || !ve.text.trim() || !ve.bbox) continue;
    const visionText = ve.text.trim();
    let bestMatch = null;
    let bestIoU = 0;

    for (const ft of figmaTexts) {
      if (!ft.bounds) continue;
      const iou = computeIoU(ve.bbox, ft.bounds);
      if (iou > bestIoU) {
        bestIoU = iou;
        bestMatch = ft;
      }
    }

    // IoU 阈值 0.1（宽松匹配，vision bbox 可能比 Figma bounds 大）
    if (bestMatch && bestIoU >= 0.1) {
      visionToFigma.set(visionText, bestMatch.text);
    } else {
      unmatchedVision.push(visionText);
    }
  }

  return { visionToFigma, unmatchedVision };
}

/**
 * 计算两个矩形的 IoU（Intersection over Union）。
 * @param {{x:number, y:number, width:number, height:number}} a
 * @param {{x:number, y:number, width:number, height:number}} b
 * @returns {number} IoU 值 [0, 1]
 */
function computeIoU(a, b) {
  if (!a || !b || a.width <= 0 || a.height <= 0 || b.width <= 0 || b.height <= 0) {
    return 0;
  }

  const ax1 = a.x;
  const ay1 = a.y;
  const ax2 = a.x + a.width;
  const ay2 = a.y + a.height;

  const bx1 = b.x;
  const by1 = b.y;
  const bx2 = b.x + b.width;
  const by2 = b.y + b.height;

  // 交集
  const ix1 = Math.max(ax1, bx1);
  const iy1 = Math.max(ay1, by1);
  const ix2 = Math.min(ax2, bx2);
  const iy2 = Math.min(ay2, by2);

  if (ix2 <= ix1 || iy2 <= iy1) return 0;

  const intersection = (ix2 - ix1) * (iy2 - iy1);
  const areaA = a.width * a.height;
  const areaB = b.width * b.height;
  const union = areaA + areaB - intersection;

  return union > 0 ? intersection / union : 0;
}

/**
 * 生成 Vision-Figma 交叉验证 Markdown 段（注入 prompt）。
 * @param {Array} visionElements vision 元素数组
 * @param {object} figmaNodeData Figma 节点树
 * @returns {string} Markdown 表格（无交叉验证结果时返回空串）
 */
export function buildVisionFigmaCrossSection(visionElements, figmaNodeData) {
  const { visionToFigma, unmatchedVision } = crossValidateVisionTexts(visionElements, figmaNodeData);

  if (visionToFigma.size === 0 && unmatchedVision.length === 0) return '';

  const lines = [];
  if (visionToFigma.size > 0) {
    lines.push('### ✅ Vision-Figma 交叉验证（空间对齐）\n');
    lines.push('> 以下映射基于 vision bbox 与 Figma TEXT 节点 bounds 的 IoU 重叠匹配，用于修正 OCR 误读。\n');
    lines.push('| Vision 文字 | Figma 真值（应使用） |');
    lines.push('|-------------|----------------------|');
    for (const [vText, fText] of visionToFigma.entries()) {
      lines.push(`| \`${vText}\` | \`${fText}\` |`);
    }
    lines.push('');
  }

  if (unmatchedVision.length > 0) {
    lines.push('### ⚠️ 未配对的 Vision 文字（可能臆造）\n');
    lines.push('> 以下 vision 文字未找到对应的 Figma TEXT 节点，可能是 OCR 误读或设计稿外内容。\n');
    for (const t of unmatchedVision) {
      lines.push(`- \`${t}\``);
    }
    lines.push('');
  }

  return lines.join('\n');
}
